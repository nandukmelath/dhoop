import { buildingsNear, insideRing, type Ring } from './buildings';
import { ASSUMPTIONS, FARM, SQM_PER_ACRE } from './config';
import { substationsNear } from './grid';
import { findCity, geocode } from './places';
import { middleOf } from './reshape';
import { ensureSession, getSession, updateSession, type PlaceRow, type SiteDetails, type SitePick, type SiteSearch, type VendorsShown } from './store';
import { VENDOR_SOURCE, vendorsFor } from './vendors';

/**
 * Where to build a solar farm, and why there.
 *
 * "I want to start a one megawatt solar farm. Find me the best area." That is not a question
 * with one number for an answer. It is a comparison, and the person wants the reasoning. So
 * Dhoop does what a consultant's first pass does:
 *
 *   1. takes the area named (a district, a state, or "near home") and lays a grid of spots over it;
 *   2. reads the long-term yield of each spot from the World Bank's Global Solar Atlas, which
 *      knows hills, coast and cloud down to a few hundred metres, then looks closer around the
 *      best one;
 *   3. counts the buildings around the sunniest spots, from the same open outlines used for
 *      roofs, and prefers open land;
 *   4. sizes the land and the energy for the plant asked for;
 *   5. hands back the best three, the reasons, and plainly what it could not check.
 *
 * What it cannot see is most of what decides a real site: who owns the land, what it costs,
 * whether it is forest, wetland or good farmland, and how far the nearest substation is. It
 * says so every time. This is where to start looking, not where to buy.
 *
 * Server-only.
 */

type Result = Record<string, unknown>;
export interface Box {
  south: number;
  north: number;
  west: number;
  east: number;
}
export interface Spot {
  lat: number;
  lon: number;
  /** Units a year from each kilowatt of panels, fixed at the best tilt. */
  yieldKwhPerKw: number;
  /** Sunshine on a panel at the best tilt, as peak hours a day. On flat ground it is a little less, more so further north. */
  sunHours: number;
  /** The tilt from flat, facing south, at which fixed panels there make the most. */
  tiltDeg?: number;
  tempC?: number;
  elevationM?: number;
}

/** Buildings within 300 metres: up to the first figure is open land, up to the second scattered houses, beyond that a village or a town. */
const OPEN = 12;
const BUILT_UP = 45;
const AROUND_M = 300;
/** The whole search must answer well inside the fifteen seconds a tool is given. Past this, counting buildings is skipped. */
const HURRY_MS = 9000;
/** How the land round a spot ranks: 0 open, 1 scattered houses, 2 built up. Not counted is taken as scattered. */
const landRank = (buildings?: number) => (buildings === undefined ? 1 : buildings <= OPEN ? 0 : buildings <= BUILT_UP ? 1 : 2);
const HEADERS = { 'User-Agent': 'dhoop-solar-demo' };

const g = globalThis as unknown as { __dhoopAtlasTilted?: Map<string, Spot | null> };
const atlasKept = () => (g.__dhoopAtlasTilted ??= new Map());

async function getJson(url: string, ms: number): Promise<unknown> {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(ms) });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

/** The long-term figures for one spot from the Global Solar Atlas. Null over the sea, or when the service does not answer. */
export async function atlasAt(lat: number, lon: number): Promise<Spot | null> {
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  const kept = atlasKept().get(key);
  if (kept !== undefined) return kept;
  let spot: Spot | null = null;
  try {
    const data = (await getJson(`https://api.globalsolaratlas.info/data/lta?loc=${lat.toFixed(4)},${lon.toFixed(4)}`, 4000)) as { annual?: { data?: Record<string, number | null> } };
    const a = data.annual?.data;
    // The atlas also covers the water off the coast, where the seabed stands in for the ground.
    // Nothing is built there, so open sea would win every comparison on a coast. Land only.
    const onLand = typeof a?.ELE !== 'number' || a.ELE > 0;
    if (a && onLand && typeof a.PVOUT_csi === 'number' && a.PVOUT_csi > 300 && typeof a.GHI === 'number') {
      spot = { lat, lon, yieldKwhPerKw: Math.round(a.PVOUT_csi), sunHours: Math.round(((typeof a.GTI_opta === 'number' && a.GTI_opta > 0 ? a.GTI_opta : a.GHI) / 365) * 100) / 100, tiltDeg: typeof a.OPTA === 'number' ? Math.round(a.OPTA) : undefined, tempC: typeof a.TEMP === 'number' ? Math.round(a.TEMP * 10) / 10 : undefined, elevationM: typeof a.ELE === 'number' ? Math.round(a.ELE) : undefined };
    }
    atlasKept().set(key, spot);
    if (atlasKept().size > 600) atlasKept().delete(atlasKept().keys().next().value as string);
  } catch {
    // Not remembered: the next question may find the service awake.
  }
  return spot;
}

/** Ask for many spots, a few at a time, so the service is not handed thirty requests at once. */
async function atlasFor(points: [number, number][]): Promise<Spot[]> {
  const out: Spot[] = [];
  for (let i = 0; i < points.length; i += 10) {
    const batch = await Promise.all(points.slice(i, i + 10).map(([lat, lon]) => atlasAt(lat, lon)));
    for (const s of batch) if (s) out.push(s);
  }
  return out;
}

/** The middles of an n by n grid of cells laid over a box. */
export function gridOver(box: Box, n: number): [number, number][] {
  const points: [number, number][] = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) points.push([box.south + ((i + 0.5) * (box.north - box.south)) / n, box.west + ((j + 0.5) * (box.east - box.west)) / n]);
  return points;
}

/** Eight spots around one, a step away each way: a closer look round the best of a grid. */
export function ringAround(lat: number, lon: number, stepLat: number, stepLon: number): [number, number][] {
  const points: [number, number][] = [];
  for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) if (a || b) points.push([lat + a * stepLat, lon + b * stepLon]);
  return points;
}

/**
 * Of the spots compared, the one to recommend, then the next two. These are already the
 * sunniest few, within a percent or two of each other, so the land decides between them: open
 * country before scattered houses before a village, and the sunnier of two alike. Spots within
 * a kilometre and a half of one already picked are passed over, so the three are three places
 * and not one place three times. `buildings` is how many stand near each spot, where that was counted.
 */
export function pickSites<T extends Spot & { buildings?: number }>(spots: T[]): T[] {
  const ranked = [...spots].sort((a, b) => landRank(a.buildings) - landRank(b.buildings) || b.yieldKwhPerKw - a.yieldKwhPerKw);
  const picks: T[] = [];
  for (const s of ranked) {
    const near = picks.some((p) => Math.hypot((p.lat - s.lat) * 111, (p.lon - s.lon) * 111 * Math.cos((s.lat * Math.PI) / 180)) < 1.5);
    if (!near) picks.push(s);
    if (picks.length === 3) break;
  }
  return picks;
}

/** The land and the energy for a plant of a given size at a spot's yield. */
export function farmSize(capacityMw: number, yieldKwhPerKw: number) {
  const acres = Math.round(capacityMw * FARM.acresPerMw * 10) / 10;
  const unitsAYear = Math.round(capacityMw * 1000 * yieldKwhPerKw);
  return { acres, sideM: Math.round(Math.sqrt(acres * SQM_PER_ACRE)), unitsAYear, co2TonnesAYear: Math.round((unitsAYear * ASSUMPTIONS.co2KgPerKwh) / 1000) };
}

interface Region {
  label: string;
  box: Box;
  /** 'near' for the country round a spot, otherwise what kind of area the map says it is. */
  kind: string;
  /** The area's own border, as rings of [lat, lon], when the map has it. A district is rarely the shape of its box. */
  rings?: Ring[];
}

/** Whether a spot lies in the area: inside its border where that is known, else inside its box. */
export function withinRegion(region: { box: Box; rings?: Ring[] }, lat: number, lon: number): boolean {
  if (region.rings?.length) return region.rings.some((ring) => insideRing([lat, lon], ring));
  return lat >= region.box.south && lat <= region.box.north && lon >= region.box.west && lon <= region.box.east;
}

/** The area a name stands for, with its border. Null when the map does not know it. */
async function regionNamed(name: string): Promise<Region | null> {
  // The border is asked for in a simplified form: a kilometre here or there does not matter for choosing spots.
  const params = new URLSearchParams({ format: 'jsonv2', limit: '3', countrycodes: 'in', 'accept-language': 'en', polygon_geojson: '1', polygon_threshold: '0.01', q: name });
  const hits = (await getJson(`https://nominatim.openstreetmap.org/search?${params}`, 7000).catch(() => [])) as { name?: string; display_name?: string; addresstype?: string; boundingbox?: string[]; geojson?: { type?: string; coordinates?: unknown } }[];
  const hit = hits.find((h) => h.boundingbox?.length === 4);
  if (!hit?.boundingbox) return null;
  const [south, north, west, east] = hit.boundingbox.map(Number);
  const shapes = hit.geojson?.type === 'Polygon' ? [hit.geojson.coordinates as number[][][]] : hit.geojson?.type === 'MultiPolygon' ? (hit.geojson.coordinates as number[][][][]) : [];
  const rings = shapes.map((shape) => (shape[0] ?? []).map(([lon, lat]) => [lat, lon] as [number, number])).filter((ring) => ring.length >= 3);
  return { label: hit.name || (hit.display_name ?? name).split(',')[0], box: { south, north, west, east }, kind: hit.addresstype ?? '', rings: rings.length ? rings : undefined };
}

/**
 * What a spot is called: its village, its taluk and its district, from the map's own lookup.
 * That service asks for no more than one question a second, so only the place recommended is
 * named this way.
 */
async function nameOnMap(lat: number, lon: number): Promise<{ name: string; district?: string; state?: string } | undefined> {
  try {
    const data = (await getJson(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=13&accept-language=en&lat=${lat}&lon=${lon}`, 4500)) as { address?: Record<string, string | undefined> };
    const a = data.address ?? {};
    const village = a.village ?? a.town ?? a.hamlet ?? a.suburb ?? a.city;
    const parts = [village, a.county && a.county !== village ? a.county : undefined].filter(Boolean).join(', ');
    const name = [parts, a.state_district ? `${a.state_district} district` : undefined].filter(Boolean).join(', ') || a.state;
    return name ? { name, district: a.state_district, state: a.state } : undefined;
  } catch {
    return undefined;
  }
}

/** The same from a second service with no such limit, which knows less. For the runners-up. */
async function nameNearby(lat: number, lon: number): Promise<string | undefined> {
  try {
    const data = (await getJson(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}&lang=en`, 3000)) as { features?: { properties?: Record<string, string | undefined> }[] };
    const p = data.features?.[0]?.properties ?? {};
    // In open country the nearest thing on the map is often a postcode area, whose "name" is a number.
    const village = p.city ?? p.locality ?? p.district ?? (p.osm_key === 'place' && p.osm_value !== 'postcode' ? p.name : undefined);
    return [village, p.county && p.county !== village ? p.county : undefined].filter(Boolean).join(', ') || undefined;
  } catch {
    return undefined;
  }
}

const COMPASS = ['east', 'north-east', 'north', 'north-west', 'west', 'south-west', 'south', 'south-east'];
/** How far one spot is from another and which way, in words: "14 km north-east". */
export function wayFrom(from: { lat: number; lon: number }, to: { lat: number; lon: number }): string {
  const dx = (to.lon - from.lon) * 111.32 * Math.cos((from.lat * Math.PI) / 180);
  const dy = (to.lat - from.lat) * 111.13;
  const km = Math.hypot(dx, dy);
  return `${km < 10 ? Math.round(km * 10) / 10 : Math.round(km)} km ${COMPASS[((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8]}`;
}

const lakh = (n: number): string => (n >= 1e7 ? `${(n / 1e7).toFixed(1)} crore` : n >= 1e5 ? `${(n / 1e5).toFixed(1)} lakh` : Math.round(n).toLocaleString('en-IN'));

/** Compare places across an area for a solar farm of a given size, and put the best on the screen with the reasons. */
export async function findSite(sid: string, capacityMwAsked: number, where: string): Promise<Result> {
  const s = ensureSession(sid);
  const began = Date.now();
  const capacityMw = Math.round(Math.min(Math.max(capacityMwAsked > 0 ? capacityMwAsked : 1, 0.05), 500) * 100) / 100;
  const asked = where.trim();
  const nearHome = !asked || /^(near|around|close to)?\s*(home|here|me|my (home|house|place|area))$/i.test(asked);

  let region: Region | null = null;
  if (nearHome) {
    const home: [number, number] | null = s.roof?.polygon && s.roof.polygon.length >= 3 ? middleOf(s.roof.polygon) : s.location ? [s.location.lat, s.location.lon] : null;
    if (!home) return { ok: false, error: 'No area was named, and the home is not placed yet.', next: 'Ask which district or state to look in, then call findSolarSite again.' };
    const dLon = 0.25 / Math.cos((home[0] * Math.PI) / 180);
    region = { label: `25 km around ${s.location?.label ?? 'the home'}`, box: { south: home[0] - 0.25, north: home[0] + 0.25, west: home[1] - dLon, east: home[1] + dLon }, kind: 'near' };
  } else {
    region = await regionNamed(asked);
    if (!region) return { ok: false, error: `The map does not know "${asked}" as an area.`, next: 'Ask for the district or the state by its usual name, then call findSolarSite again.' };
    const spanLat = region.box.north - region.box.south;
    const spanLon = region.box.east - region.box.west;
    if (spanLat > 9 || spanLon > 9) return { ok: false, error: 'That is too large an area to compare in one go.', next: 'Ask which state or district they have in mind, then call findSolarSite again.' };
    // A town or a village: look in the country round it, about 15 km each way.
    if (spanLat < 0.2 && spanLon < 0.2) {
      const lat = (region.box.south + region.box.north) / 2;
      const lon = (region.box.west + region.box.east) / 2;
      region = { label: `15 km around ${region.label}`, box: { south: lat - 0.14, north: lat + 0.14, west: lon - 0.14, east: lon + 0.14 }, kind: 'near' };
    }
  }

  updateSession(sid, () => {}, { kind: 'findSolarSite', text: `Comparing places across ${region.label} for a ${capacityMw} MW solar farm…` });

  // A grid over the area, keeping the spots inside its border. A long thin district fills little
  // of its box, so the grid is made finer until enough spots fall inside.
  const area = region;
  let n = 4;
  let points: [number, number][] = [];
  for (n of [4, 6, 8]) {
    points = gridOver(area.box, n).filter(([lat, lon]) => withinRegion(area, lat, lon));
    if (points.length >= 12) break;
  }
  let spots = await atlasFor(points);
  if (!spots.length) return { ok: false, error: 'The solar data for that area could not be read just now.', next: 'Say so, and offer to try again in a moment.' };
  // Then a closer look round the best spot, twice over a large area.
  let stepLat = (area.box.north - area.box.south) / n / 3;
  let stepLon = (area.box.east - area.box.west) / n / 3;
  for (let round = 0; round < (stepLat > 0.06 ? 2 : 1); round++) {
    const best = [...spots].sort((a, b) => b.yieldKwhPerKw - a.yieldKwhPerKw)[0];
    const closer = ringAround(best.lat, best.lon, stepLat, stepLon).filter(([lat, lon]) => withinRegion(area, lat, lon));
    spots = [...spots, ...(await atlasFor(closer))];
    stepLat /= 3;
    stepLon /= 3;
  }

  // The sunniest few: what stands around them, and what they are called.
  const sunniest = [...spots].sort((a, b) => b.yieldKwhPerKw - a.yieldKwhPerKw).slice(0, 5);
  const hurry = Date.now() - began > HURRY_MS;
  const counted = (lat: number, lon: number) => (hurry ? Promise.resolve(null) : Promise.race([buildingsNear(lat, lon, AROUND_M).catch(() => null), new Promise<null>((done) => setTimeout(() => done(null), 4500))]));
  const looked = await Promise.all(
    sunniest.map(async (sp) => {
      const near = await counted(sp.lat, sp.lon);
      return { ...sp, buildings: near ? near.length : undefined };
    }),
  );
  const chosen = pickSites(looked);
  // Names: the recommended place from the map's own lookup, the others from the quicker one, and
  // where neither knows, by how far it lies from the first and which way.
  // And, while the names are being looked up, the substations round the place recommended.
  const [placed, others, substations] = await Promise.all([
    nameOnMap(chosen[0].lat, chosen[0].lon),
    Promise.all(chosen.slice(1).map((sp) => nameNearby(sp.lat, sp.lon))),
    substationsNear(chosen[0].lat, chosen[0].lon).catch(() => null),
  ]);
  const names = [placed?.name, ...others];
  const picks = chosen.map((sp, i) => ({ ...sp, name: names[i] ?? (i === 0 ? `the middle of ${area.label}` : `a spot ${wayFrom(chosen[0], sp)} of the first`) }));
  const best = picks[0];
  const homeAt = s.roof?.polygon && s.roof.polygon.length >= 3 ? middleOf(s.roof.polygon) : s.location ? ([s.location.lat, s.location.lon] as [number, number]) : null;
  const fromHome = homeAt ? wayFrom({ lat: homeAt[0], lon: homeAt[1] }, best) : undefined;

  const yields = spots.map((sp) => sp.yieldKwhPerKw).sort((a, b) => a - b);
  const middle = yields[Math.floor(yields.length / 2)];
  const aboveMiddle = Math.round(((best.yieldKwhPerKw - middle) / middle) * 1000) / 10;
  const abovePoorest = Math.round(((best.yieldKwhPerKw - yields[0]) / yields[0]) * 1000) / 10;
  const size = farmSize(capacityMw, best.yieldKwhPerKw);
  const inKusum = capacityMw >= FARM.kusumMw.least && capacityMw <= FARM.kusumMw.most;

  const reasons = [
    `Sun: of the ${spots.length} places compared across ${region.label}, it has the highest yield: each kilowatt of panels makes about ${best.yieldKwhPerKw.toLocaleString('en-IN')} units a year there, ${aboveMiddle > 0 ? `${aboveMiddle}% more than a middling spot` : 'the same as a middling spot'} and ${abovePoorest}% more than the poorest.`,
    best.buildings === undefined
      ? 'Land: what stands around it could not be counted in time.'
      : landRank(best.buildings) === 0
        ? `Land: it is open country, with ${best.buildings === 0 ? 'no buildings' : `${best.buildings} building${best.buildings === 1 ? '' : 's'}`} within ${AROUND_M} metres, so there may be room for ${size.acres} acres in one piece. Among the sunniest spots, open land was preferred.`
        : landRank(best.buildings) === 1
          ? `Land: not clear ground. There are scattered houses, ${best.buildings} buildings within ${AROUND_M} metres, and none of the sunniest spots was emptier. A plot of ${size.acres} acres in one piece will take looking for.`
          : `Land: not clear ground. It is a built-up place, with ${best.buildings} buildings within ${AROUND_M} metres, and so was every other spot among the sunniest. A plot of ${size.acres} acres has still to be found somewhere around it.`,
    best.tempC !== undefined ? `Heat: the air there averages ${best.tempC} degrees${best.elevationM !== undefined ? `, at ${best.elevationM} metres above the sea` : ''}. Panels give a little less when hot, and the yield figure already allows for that.` : '',
    best.tiltDeg !== undefined ? `Tilt: fixed panels there make the most tilted about ${best.tiltDeg} degrees, facing south.` : '',
    fromHome ? `Distance: it is about ${fromHome} of the home.` : '',
    inKusum ? `Scheme: a plant of ${capacityMw} MW is the size PM-KUSUM Component A is for (${FARM.kusumMw.least} to ${FARM.kusumMw.most} MW on barren or uncultivable farm land, selling to the electricity company).` : '',
  ].filter(Boolean);
  const notChecked = 'Who owns the land and what it costs; whether it is forest, wetland or good farmland; the slope; and whether the nearest substation has room for the power. A site visit and the electricity company settle those.';

  const toPick = (sp: (typeof picks)[number]): SitePick => ({ name: sp.name, lat: sp.lat, lon: sp.lon, yieldKwhPerKw: sp.yieldKwhPerKw, sunHours: sp.sunHours, tiltDeg: sp.tiltDeg, tempC: sp.tempC, elevationM: sp.elevationM, buildings: sp.buildings });
  const site: SiteSearch = {
    key: `${best.lat.toFixed(4)},${best.lon.toFixed(4)}:${capacityMw}:${Date.now().toString(36)}`,
    capacityMw,
    region: region.label,
    compared: spots.length,
    ...size,
    picks: picks.map(toPick),
    reasons,
    notChecked,
    details: siteDetailsOf(best, capacityMw, size.unitsAYear, placed, substations),
  };
  updateSession(
    sid,
    (x) => {
      x.site = site;
      x.view = 'roof';
    },
    { kind: 'findSolarSite', text: `Best place for a ${capacityMw} MW solar farm in ${region.label}: near ${best.name}. ${size.acres} acres, about ${lakh(size.unitsAYear)} units a year` },
  );

  return {
    ok: true,
    looked_in: region.label,
    places_compared: spots.length,
    best_place: `near ${best.name}`,
    ...(fromHome ? { how_far_from_the_home: `about ${fromHome} of the home` } : {}),
    why_it_is_best: reasons,
    // Said in so many words, because "open land will have to be found" was once read back as "there is open land".
    the_land_there: best.buildings === undefined ? 'not counted' : landRank(best.buildings) === 0 ? 'open country: a plot is likely to be had' : landRank(best.buildings) === 1 ? 'scattered houses: NOT clear ground, a plot has to be looked for' : 'built up: NOT clear ground, a plot has still to be found around it',
    plant_size_mw: capacityMw,
    land_needed_acres: size.acres,
    land_is_a_square_of_metres_a_side: size.sideM,
    energy_a_year_in_words: `about ${lakh(size.unitsAYear)} units`,
    co2_avoided_tonnes_a_year: size.co2TonnesAYear,
    // Each runner-up is set against the first in so many words, so that "why not the second?" is
    // answered from this and not from a figure that belongs to another comparison.
    next_best: picks.slice(1).map((sp) => {
      const less = Math.round((1 - sp.yieldKwhPerKw / best.yieldKwhPerKw) * 1000) / 10;
      const land = sp.buildings === undefined || best.buildings === undefined ? '' : sp.buildings > best.buildings ? `, and more buildings around it: ${sp.buildings} within ${AROUND_M} metres against ${best.buildings}` : `, with ${sp.buildings} building${sp.buildings === 1 ? '' : 's'} within ${AROUND_M} metres`;
      return {
        place: /^a spot/.test(sp.name) ? sp.name : `near ${sp.name}`,
        units_a_year_from_each_kilowatt: sp.yieldKwhPerKw,
        against_the_first: `${less < 0.05 ? 'the same yield' : `${less}% less yield`}${land}`,
      };
    }),
    seconds_taken: Math.round((Date.now() - began) / 100) / 10,
    what_was_not_checked: notChecked,
    // The practical side, fetched already: said only when asked, or offered in a few words.
    also_worked_out: detailsForModel(site),
    sources: 'Yield: Global Solar Atlas (World Bank). Land per megawatt: about 4 to 5 acres, a planning figure. Buildings: open footprint data.',
    next: 'Give your reasoning aloud in three short sentences: the place you recommend, the one or two reasons that decided it, and the land and the energy a year. Say what the_land_there says, plainly: never call it open when it is not. Then say in one sentence that you have also looked up the nearest substation, the registered vendors and the money, and ask which they want. The screen is showing the place with the land marked. If they ask why, answer from why_it_is_best. If they ask about another place, answer from its against_the_first, and use no other percentage for it. If they ask about the grid, vendors or money, answer from also_worked_out, or call siteDetails.',
  };
}

/**
 * Places set side by side for solar, the best first, each with how far it falls behind the best.
 * And the reason in a sentence: how much more the same panels make in the best than in the last.
 */
export function rankPlaces(rows: Omit<PlaceRow, 'behindPercent'>[]): { rows: PlaceRow[]; reason: string } {
  const sorted = [...rows].sort((a, b) => b.yieldKwhPerKw - a.yieldKwhPerKw);
  const best = sorted[0];
  const ranked = sorted.map((r) => ({ ...r, behindPercent: Math.round((1 - r.yieldKwhPerKw / best.yieldKwhPerKw) * 1000) / 10 }));
  const last = ranked[ranked.length - 1];
  const more = Math.round((best.yieldKwhPerKw / last.yieldKwhPerKw - 1) * 1000) / 10;
  const heat = best.tempC !== undefined && last.tempC !== undefined && Math.abs(best.tempC - last.tempC) >= 1.5 ? ` ${best.label} is also ${Math.abs(Math.round((best.tempC - last.tempC) * 10) / 10)} degrees ${best.tempC < last.tempC ? 'cooler, which panels like' : 'hotter, which costs panels a little, and it still comes out ahead'}.` : '';
  return {
    rows: ranked,
    reason:
      more < 1
        ? `There is almost nothing between them: the same panels make within one percent of each other in ${ranked.map((r) => r.label).join(' and ')}.`
        : `${best.label} is the better place: the same panels make about ${more}% more there than in ${last.label}, ${best.yieldKwhPerKw.toLocaleString('en-IN')} against ${last.yieldKwhPerKw.toLocaleString('en-IN')} units a year from each kilowatt.${heat}`,
  };
}

/** Set two to four named places side by side for solar, and put the comparison on the screen. */
export async function comparePlaces(sid: string, asked: string): Promise<Result> {
  const s = ensureSession(sid);
  const names = (asked.includes(';') ? asked.split(';') : asked.split(/\s+(?:and|or|vs\.?|versus)\s+|,/i)).map((n) => n.trim()).filter(Boolean).slice(0, 4);
  if (names.length < 2) return { ok: false, error: 'Need at least two places to compare.', next: 'Ask which places, then call comparePlaces with them separated by semicolons.' };
  const found: { label: string; lat: number; lon: number }[] = [];
  const unknown: string[] = [];
  let asksOfTheMap = 0;
  for (const name of names) {
    // Well-known cities are answered from the list in the app. Anything else is looked up on the
    // map, which asks for no more than one question a second.
    const city = findCity(name);
    if (!city && asksOfTheMap++ > 0) await new Promise((done) => setTimeout(done, 1100));
    const place = city ?? (await geocode(name).catch(() => undefined));
    if (place) found.push({ label: place.label.split(',')[0], lat: place.lat, lon: place.lon });
    else unknown.push(name);
  }
  const read = await Promise.all(found.map(async (p) => ({ p, spot: await atlasAt(p.lat, p.lon) })));
  const rows = read.filter((r) => r.spot).map(({ p, spot }) => ({ label: p.label, lat: p.lat, lon: p.lon, yieldKwhPerKw: spot!.yieldKwhPerKw, sunHours: spot!.sunHours, tiltDeg: spot!.tiltDeg, tempC: spot!.tempC }));
  if (rows.length < 2) return { ok: false, error: unknown.length ? `The map does not know ${unknown.join(' or ')}.` : 'The solar data could not be read just now.', next: 'Say so, and ask for the nearest town, or offer to try again.' };
  const { rows: ranked, reason } = rankPlaces(rows);
  const kw = s.design?.kw;
  updateSession(
    sid,
    (x) => {
      x.places = { key: `${ranked.map((r) => r.label).join('|')}:${Date.now().toString(36)}`, rows: ranked, reason, forKw: kw };
    },
    { kind: 'comparePlaces', text: `Compared ${ranked.map((r) => r.label).join(', ')} for solar: ${ranked[0].label} makes the most` },
  );
  return {
    ok: true,
    best_place: ranked[0].label,
    the_reason: reason,
    places: ranked.map((r) => ({ place: r.label, units_a_year_from_each_kilowatt: r.yieldKwhPerKw, sun_hours_a_day_on_tilted_panels: r.sunHours, ...(r.tiltDeg !== undefined ? { best_tilt_degrees_facing_south: r.tiltDeg } : {}), ...(r.tempC !== undefined ? { average_temperature: r.tempC } : {}), percent_behind_the_best: r.behindPercent, ...(kw ? { [`units_a_year_from_their_${kw}_kw_system`]: Math.round(r.yieldKwhPerKw * kw) } : {}) })),
    ...(unknown.length ? { could_not_find: unknown } : {}),
    source: 'Global Solar Atlas (World Bank): long-term yield of fixed panels at the best tilt.',
    next: 'Say which place is better and by how much, in one or two sentences, with the reason. The screen shows them side by side.',
  };
}

/** What the electricity company pays, what the plant earns and costs, and how long it takes to pay back. Rough, and it says what it leaves out. */
export function farmMoney(capacityMw: number, unitsAYear: number, state?: string): SiteDetails['money'] {
  const own = state && /karnataka/i.test(state) ? FARM.paidPerUnit.Karnataka : null;
  const range = FARM.paidPerUnit.elsewhere;
  const perUnit = own ? own.rupees : Math.round(((range.low + range.high) / 2) * 100) / 100;
  const earnsAYear = Math.round(unitsAYear * perUnit);
  const cost: [number, number] = [capacityMw * FARM.costCrorePerMw.low * 1e7, capacityMw * FARM.costCrorePerMw.high * 1e7];
  const years = (rupees: number) => (earnsAYear > 0 ? Math.round((rupees / earnsAYear) * 10) / 10 : 0);
  return { perUnit, perUnitRange: own ? undefined : [range.low, range.high], perUnitWhat: own ? own.what : range.what, earnsAYear, cost, payback: [years(cost[0]), years(cost[1])] };
}

/** The practical side of a site, put together from what was fetched: the grid, who can build it, the money. */
function siteDetailsOf(
  best: { lat: number; lon: number },
  capacityMw: number,
  unitsAYear: number,
  placed: { district?: string; state?: string } | undefined,
  substations: Awaited<ReturnType<typeof substationsNear>> | null,
): SiteDetails {
  return {
    district: placed?.district,
    state: placed?.state,
    substations: substations ? substations.slice(0, 3).map((sub) => ({ name: sub.name, operator: sub.operator, kv: sub.kv, km: sub.km, way: wayFrom(best, sub).replace(/^[\d.]+ km /, '') })) : null,
    vendors: vendorsShown(placed?.district, placed?.state),
    money: farmMoney(capacityMw, unitsAYear, placed?.state),
  };
}

/** The registered vendors to show for a place: its district's own list where that was read, its state's otherwise. Five, so they fit a screen and a spoken answer. */
export function vendorsShown(district?: string, state?: string): VendorsShown | undefined {
  const list = vendorsFor(district, state);
  if (!list) return undefined;
  return { scope: list.scope, place: list.place, district: list.scope === 'state' ? district : undefined, readOn: list.readOn, list: list.vendors.slice(0, 5) };
}

/** A vendor list in words the model can read out, saying how local it is. `forFarm` adds that a megawatt is a bigger job than a roof. */
export function vendorsForModel(v: VendorsShown | undefined, where: string | undefined, forFarm: boolean): Result {
  if (!v) {
    return { not_known_where: `Which state ${where ?? 'this place'} is in could not be told, so no list was picked. The official list is on pmsuryaghar.gov.in under "Registered vendors", by state and district. Say so plainly; do not name vendors.` };
  }
  const own = v.scope === 'district';
  return {
    where_from: own
      ? `The national rooftop solar portal's registered vendors for ${v.place} district, the ones with the most installations there, read on ${v.readOn}.`
      : `The national rooftop solar portal's registered vendors with the most installations in ${v.place} as a whole, read on ${v.readOn}. They are the state's busiest, NOT picked for being near${v.district ? ` ${v.district}` : ' this place'}: the person should ask each whether they work there.`,
    vendors: v.list.map((x) => `${x.name}: phone ${x.phone}; ${x.ratings > 0 ? `rated ${x.rating} of 5 by ${x.ratings.toLocaleString('en-IN')} consumers` : 'not yet rated by consumers'}; ${x.installs.toLocaleString('en-IN')} installations${own ? '' : ' across the state'}`),
    note: `${forFarm ? 'They are rooftop vendors. Many build ground plants too, but a megawatt is a bigger job, so ask each. ' : 'They are registered for the subsidy scheme, which is what a home needs. It is a list, not a recommendation: Dhoop has not checked their work. '}The numbers are on the screen: say the first two names${own ? '' : ` and that they are ${v.place}'s busiest`}, and read a number aloud only if asked, a digit at a time.`,
  };
}

const crore = (rupees: number) => (rupees >= 1e7 ? `${Math.round(rupees / 1e6) / 10} crore` : `${Math.round(rupees / 1e4) / 10} lakh`);

/** The details in words the model can read out, each with what is not known. */
function detailsForModel(site: SiteSearch): Result {
  const d = site.details;
  if (!d) return { not_fetched: 'The details could not be fetched.' };
  const subs = d.substations;
  const m = d.money;
  return {
    grid:
      subs === null
        ? 'The map of substations could not be read just now. Offer to try again in a moment.'
        : subs.length
          ? {
              nearest_substations: subs.map((sub) => `${sub.name ?? 'an unnamed substation'}${sub.operator ? `, run by ${sub.operator}` : ''}${sub.kv.length ? `, ${sub.kv.join(' and ')} kilovolts` : ''}: ${sub.km} km to the ${sub.way}`),
              within_the_five_km_the_scheme_prefers: subs[0].km <= FARM.substationWithinKm,
              not_known: 'Whether it has room for more power: the electricity company publishes that substation by substation and has to be asked. Small substations are often missing from the map, so a nearer one may exist.',
            }
          : 'No substation is mapped within 25 km of the place. Small ones are often missing from the map: the electricity company can name the nearest.',
    vendors: vendorsForModel(d.vendors, d.district, true),
    money: {
      paid_for_each_unit: m.perUnitRange ? `about ${m.perUnitRange[0]} to ${m.perUnitRange[1]} rupees (${m.perUnitWhat})` : `${m.perUnit} rupees (${m.perUnitWhat})`,
      earns_a_year_in_words: `about ${crore(m.earnsAYear)} rupees`,
      costs_to_build_in_words: `about ${crore(m.cost[0])} to ${crore(m.cost[1])} rupees, land not counted`,
      pays_back_in_years: `about ${m.payback[0]} to ${m.payback[1]}`,
      buys_for_years: FARM.buysForYears,
      left_out: 'Running costs, the price or rent of the land, interest on a loan, and the slow fall in output over the years. So it takes longer than this in practice.',
      check_first: 'Whether PM-KUSUM Component A is still open in this state. Its last date has been moved more than once.',
    },
  };
}

/** The practical details of the place last recommended for a solar farm, fetched again if the grid could not be read the first time. */
export async function siteDetails(sid: string): Promise<Result> {
  const s = getSession(sid);
  const site = s?.site;
  if (!site?.picks.length) return { ok: false, error: 'No place for a solar farm has been found yet.', next: 'Call findSolarSite first, with the size and the area to look in.' };
  if (site.details && site.details.substations === null) {
    const again = await substationsNear(site.picks[0].lat, site.picks[0].lon).catch(() => null);
    if (again) {
      const best = site.picks[0];
      updateSession(sid, (x) => {
        if (x.site?.details) x.site.details.substations = again.slice(0, 3).map((sub) => ({ name: sub.name, operator: sub.operator, kv: sub.kv, km: sub.km, way: wayFrom(best, sub).replace(/^[\d.]+ km /, '') }));
      });
    }
  }
  const now = getSession(sid)?.site ?? site;
  updateSession(sid, () => {}, { kind: 'siteDetails', text: `Looked up the grid, the vendors and the money for the place near ${now.picks[0].name}` });
  return {
    ok: true,
    place: `near ${now.picks[0].name}`,
    plant_size_mw: now.capacityMw,
    ...detailsForModel(now),
    next: 'Answer what they asked from this, in two or three short sentences, and add in a few words what is not known. About money, give all four: what is paid a unit, what it earns a year, what it costs to build, and the years to pay back. About vendors, give names and ratings, and say the numbers are on the screen unless they ask for the numbers. Do not ask the person for any of it. The screen shows all three.',
  };
}

/** Words that mean "where I am" when a place is asked for. */
const HERE = /^(|here|home|me|mine|nearby|near ?me|near ?by|around here|this (place|area|town|city)|my (own )?(place|home|house|area|town|city|village|district|state|roof))$/i;

/** A named place as the map files it: what it is called, its district and its state. One question, with the address asked for. */
async function districtOf(query: string): Promise<{ label: string; district?: string; state?: string } | undefined> {
  const params = new URLSearchParams({ format: 'jsonv2', limit: '3', countrycodes: 'in', addressdetails: '1', 'accept-language': 'en', q: query });
  const hits = (await getJson(`https://nominatim.openstreetmap.org/search?${params}`, 6000).catch(() => [])) as { name?: string; display_name?: string; address?: Record<string, string | undefined> }[];
  // The first answer is the best known place of that name, which is what a person means by a bare
  // "Kerala" or "Jaipur"; a village that happens to share the name comes after it. But the first
  // answer for "Leh" is a boundary filed under no state at all, with the town second: so the
  // first answer that says which state it is in.
  const list = Array.isArray(hits) ? hits : [];
  const hit = list.find((h) => h.address?.state ?? h.address?.territory) ?? list[0];
  if (!hit) return undefined;
  const a = hit.address ?? {};
  return { label: hit.name || (hit.display_name ?? query).split(',')[0], district: a.state_district, state: a.state ?? a.territory };
}

/**
 * Registered vendors for any place in India: "who installs solar in Jaipur?", or where the
 * person is. The district's own list is used where it has been read, the state's busiest
 * vendors otherwise, and the answer says which.
 */
export async function findVendors(sid: string, where: string): Promise<Result> {
  const s = ensureSession(sid);
  const asked = where.trim();
  let found: { label: string; district?: string; state?: string } | undefined;
  if (HERE.test(asked)) {
    if (!s.location) return { ok: false, error: 'No place is known yet.', next: 'Ask which town, district or state they mean, then call findVendors with it.' };
    const named = await nameOnMap(s.location.lat, s.location.lon);
    found = { label: s.location.label, district: named?.district, state: named?.state };
  } else {
    found = await districtOf(asked);
    // A place the map does not know may still be a state or a district said plainly.
    if (!found?.state && vendorsFor(asked, asked)) found = { label: asked, district: asked, state: asked };
  }
  if (!found) return { ok: false, error: `Could not find "${asked}" on the map.`, next: 'Ask for the district or the state, then call findVendors again.' };
  const shown = vendorsShown(found.district, found.state);
  if (!shown) return { ok: false, error: `Could not tell which state ${found.label} is in.`, source: VENDOR_SOURCE, next: 'Ask which state it is in, then call findVendors with the state. Do not name vendors until it answers.' };
  const label = found.label;
  updateSession(
    sid,
    (x) => {
      x.vendors = { ...shown, key: `${shown.place}:${Date.now().toString(36)}`, askedFor: label };
    },
    { kind: 'findVendors', text: `Looked up registered vendors for ${label}` },
  );
  return {
    ok: true,
    asked_for: label,
    ...vendorsForModel(shown, found.district ?? label, false),
    next: 'Say whose list it is in a few words, then the first two names with their ratings, and that all five with their numbers are on the screen. Offer to read a number out. Never add a vendor that is not in this list.',
  };
}
