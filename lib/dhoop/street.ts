import { buildingsNear, insideRing, type Ring } from './buildings';
import { ASSUMPTIONS, SQFT_PER_M2 } from './config';
import { DEFAULT_SHADE } from './findroof';
import { middleOf } from './reshape';
import { dailyYieldPerKw, inr, roofCapacity } from './solar';
import { ensureSession, getSession, updateSession, type Street } from './store';

/**
 * The whole neighbourhood, added up.
 *
 * One roof is a saving. A street of them is a power station. When someone asks what their
 * lane, colony, apartment society or village could do, Dhoop takes every building outline
 * within reach of the home, fills each roof as far as it goes with the same rule it uses for
 * the home, and adds them up. The satellite view lights the roofs up around the home.
 *
 * It is an upper limit and says so: real roofs have tanks and shade, and not every owner will
 * agree. No new assumption is made for it. The size of a roof's system, the sunshine, the
 * price of a unit and the carbon figure are the ones in config.ts that the home's own numbers
 * use.
 *
 * Server-only: it reads the building outlines.
 */

/** A large number the way it is said in India, for the agent to read out: "7.6 crore", "76.1 lakh", "42 thousand". */
const said = (n: number): string => (n >= 1e7 ? `${(n / 1e7).toFixed(1)} crore` : n >= 1e5 ? `${(n / 1e5).toFixed(1)} lakh` : n >= 1000 ? `${Math.round(n / 1000)} thousand` : String(Math.round(n)));

/** How far round the home to look, in metres. */
export const STREET_REACH_M = { least: 60, usual: 200, most: 400 };
/** More roofs than this are slow to draw on a phone. The nearest are kept and the reach shrinks to fit them. */
const MOST_ROOFS = 500;

type Totals = Pick<Street, 'roofs' | 'roofM2' | 'kw' | 'panels' | 'unitsAYear' | 'rupeesAYear' | 'tariff' | 'homesLikeThis' | 'co2TonnesAYear'>;

/**
 * What a set of roofs could make between them, each filled as far as it goes.
 * `monthlyUnits` is the home's own use, when a bill is known: the total is then also given as
 * so many homes like it.
 */
export function streetTotals(areasM2: number[], o: { sunHours?: number; tariff?: number; monthlyUnits?: number } = {}): Totals {
  let kw = 0;
  let panels = 0;
  let roofM2 = 0;
  for (const area of areasM2) {
    const cap = roofCapacity(area, DEFAULT_SHADE);
    kw += cap.kw;
    panels += cap.panels;
    roofM2 += area;
  }
  const unitsAYear = kw * dailyYieldPerKw(o.sunHours && o.sunHours > 1 ? o.sunHours : ASSUMPTIONS.defaultSunHours) * 365;
  const tariff = o.tariff && o.tariff > 0 ? o.tariff : ASSUMPTIONS.defaultTariff;
  return {
    roofs: areasM2.length,
    roofM2: Math.round(roofM2),
    kw: Math.round(kw * 10) / 10,
    panels,
    unitsAYear: Math.round(unitsAYear),
    rupeesAYear: Math.round(unitsAYear * tariff),
    tariff,
    homesLikeThis: o.monthlyUnits && o.monthlyUnits > 0 ? Math.round(unitsAYear / (o.monthlyUnits * 12)) : undefined,
    co2TonnesAYear: Math.round((unitsAYear * ASSUMPTIONS.co2KgPerKwh) / 1000),
  };
}

const g = globalThis as unknown as { __dhoopStreets?: Map<string, { key: string; rings: Ring[] }> };
const kept = () => (g.__dhoopStreets ??= new Map());

/** The roofs within reach of a spot, nearest first, with the home's own roof counted at the size it has now. */
async function gather(lat: number, lon: number, radiusM: number, home?: { ring?: Ring; areaM2: number }): Promise<{ rings: Ring[]; areas: number[]; radiusM: number }> {
  const near = await buildingsNear(lat, lon, radiusM);
  // The home is drawn with its own outline and panels, so the footprint data's outline of it is
  // left out of the drawing: the one that holds the home's middle, or sits inside the home's outline.
  const others = home?.ring ? near.filter((b) => !insideRing([lat, lon], b.ring) && !insideRing(middleOf(b.ring), home.ring!)) : near;
  const drawn = others.slice(0, MOST_ROOFS);
  return {
    rings: drawn.map((b) => b.ring.map(([a, o]) => [Math.round(a * 1e6) / 1e6, Math.round(o * 1e6) / 1e6] as [number, number])),
    areas: [...(home ? [home.areaM2] : []), ...drawn.map((b) => b.areaM2)],
    radiusM: drawn.length < others.length ? Math.max(STREET_REACH_M.least, Math.round(drawn[drawn.length - 1].distanceM)) : radiusM,
  };
}

const homeOf = (s: { roof?: { polygon?: Ring; areaM2: number } }) => (s.roof ? { ring: s.roof.polygon && s.roof.polygon.length >= 3 ? s.roof.polygon : undefined, areaM2: s.roof.areaM2 } : undefined);

/** Add up the neighbourhood around the home and put it on the screen. */
export async function showStreet(sid: string, askedM: number): Promise<Record<string, unknown>> {
  const s = ensureSession(sid);
  const home = homeOf(s);
  const at: [number, number] | null = home?.ring ? middleOf(home.ring) : s.location ? [s.location.lat, s.location.lon] : null;
  if (!at) return { ok: false, error: 'The home is not placed yet.', next: 'Find the home first: call findMyRoof, or ask which city or town it is in and call setLocation.' };
  const radiusM = Math.round(Math.min(Math.max(askedM > 0 ? askedM : STREET_REACH_M.usual, STREET_REACH_M.least), STREET_REACH_M.most));
  let found: Awaited<ReturnType<typeof gather>>;
  try {
    found = await gather(at[0], at[1], radiusM, home);
  } catch (error) {
    console.warn('Building lookup failed:', error instanceof Error ? error.message.slice(0, 120) : error);
    return { ok: false, error: 'The building data could not be reached.', next: 'Say so, and offer to try again in a moment.' };
  }
  if (found.areas.length < 2) return { ok: false, error: 'No other buildings are mapped around here.', next: 'Say so in a few words.' };

  const totals = streetTotals(found.areas, { sunHours: s.location?.sunHours, tariff: s.bill?.tariff, monthlyUnits: s.bill?.monthlyUnits });
  // The time is part of the key, so asking again lights the roofs up again.
  const key = `${at[0].toFixed(5)},${at[1].toFixed(5)}:${found.radiusM}:${totals.roofs}:${Date.now().toString(36)}`;
  kept().set(sid, { key, rings: found.rings });
  if (kept().size > 40) kept().delete(kept().keys().next().value as string);
  const street: Street = { key, lat: at[0], lon: at[1], radiusM: found.radiusM, ...totals };
  const power = totals.kw >= 1000 ? `${(totals.kw / 1000).toFixed(2)} MW` : `${Math.round(totals.kw)} kW`;
  updateSession(
    sid,
    (x) => {
      x.street = street;
      x.view = 'roof';
    },
    { kind: 'showNeighbourhood', text: `Neighbourhood added up: ${totals.roofs} roofs within ${found.radiusM} m could hold ${power} and make ${inr(totals.rupeesAYear)} of electricity a year` },
  );
  return {
    ok: true,
    around: s.location?.label,
    within_metres: found.radiusM,
    roofs: totals.roofs,
    total_roof_area_sqft: Math.round(totals.roofM2 * SQFT_PER_M2),
    panels_in_all: totals.panels,
    power_in_all_kw: totals.kw,
    ...(totals.kw >= 1000 ? { power_in_all_megawatts: Math.round(totals.kw / 10) / 100 } : {}),
    power_in_words: totals.kw >= 1000 ? `about ${(totals.kw / 1000).toFixed(1)} megawatts` : `about ${Math.round(totals.kw)} kilowatts`,
    units_made_a_year: totals.unitsAYear,
    units_a_year_in_words: `about ${said(totals.unitsAYear)} units`,
    worth_rupees_a_year: totals.rupeesAYear,
    worth_a_year_in_words: `about ${said(totals.rupeesAYear)} rupees`,
    counted_at_rupees_a_unit: totals.tariff,
    ...(totals.homesLikeThis ? { as_much_as_this_many_homes_like_theirs_use: totals.homesLikeThis } : {}),
    co2_avoided_tonnes_a_year: totals.co2TonnesAYear,
    what_this_is: 'Every roof filled with panels as far as it goes. An upper limit, not a forecast: real roofs have tanks, stairs and shade, and not every owner will agree.',
    next: 'In two short sentences say how many roofs there are, how much power they could hold in all, and what that electricity is worth a year, using the figures given in words. Say once that this is an upper limit. The screen is lighting the roofs up.',
  };
}

/** The outlines to light up for a session's neighbourhood, nearest first. Null when it has none. */
export async function streetRings(sid: string): Promise<{ key: string; rings: Ring[] } | null> {
  const s = getSession(sid);
  if (!s?.street) return null;
  const have = kept().get(sid);
  if (have?.key === s.street.key) return have;
  // The server has restarted since they were gathered: gather them again around the same spot.
  try {
    const found = await gather(s.street.lat, s.street.lon, s.street.radiusM, homeOf(s));
    const again = { key: s.street.key, rings: found.rings };
    kept().set(sid, again);
    return again;
  } catch {
    return null;
  }
}
