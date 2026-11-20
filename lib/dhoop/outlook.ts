import { MJ_PER_KWH } from './config';
import { dailyYieldPerKw } from './solar';
import { ensureSession, updateSession, type SunWeek } from './store';

/**
 * This week on the roof: the weather forecast for the home, turned into what its system would
 * make on each of the next seven days.
 *
 * Everything else Dhoop says about sunshine is the long-term average for the place. This is
 * the one thing that is about tomorrow: "it will be bright on Saturday, about fourteen units;
 * run the washing machine then." The forecast is Open-Meteo's daily sum of sunshine reaching
 * the ground, which needs no key. It is turned into units with the same sum as the design
 * (`dailyYieldPerKw`), so a usual day here and a usual day there agree.
 *
 * A forecast changes, and one cloud can halve an hour. The answer says so.
 */

type Result = Record<string, unknown>;

export const FORECAST_SOURCE = 'Open-Meteo (open-meteo.com)';

/** A day's sunshine on flat ground in megajoules a square metre, as peak sun hours. */
export const sunHoursFromMj = (mj: number): number => Math.round((mj / MJ_PER_KWH) * 100) / 100;

/** What a system makes on a day with that much sun, to a tenth of a unit. */
export const unitsOn = (kw: number, sunHours: number): number => Math.round(kw * dailyYieldPerKw(sunHours) * 10) / 10;

/** A word for the day, from how its sunshine compares with a usual day's and how likely rain is. */
export function skyWord(sunHours: number, usual: number, rainChance?: number): string {
  if ((rainChance ?? 0) >= 60) return 'rain likely';
  const share = usual > 0 ? sunHours / usual : 1;
  return share >= 1.1 ? 'bright' : share >= 0.9 ? 'fair' : share >= 0.7 ? 'cloudy' : 'dull';
}

/** The forecast's days as the screen keeps them. With no long-term figure for the month, each day is set against the best of the week. */
export function weekOutlook(raw: { date: string; mj: number; rainChance?: number }[], usualSunHours?: number): SunWeek['days'] {
  const clean = raw.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.date) && Number.isFinite(d.mj) && d.mj >= 0);
  const hours = clean.map((d) => sunHoursFromMj(d.mj));
  const usual = usualSunHours && usualSunHours > 0 ? usualSunHours : Math.max(0, ...hours);
  return clean.map((d, i) => ({ date: d.date, sunHours: hours[i], sky: skyWord(hours[i], usual, d.rainChance), rainChance: Number.isFinite(d.rainChance) ? d.rainChance : undefined }));
}

/** Which of the days after today makes the most. With only today to go on, today. */
export function bestAhead(units: number[]): number {
  const ahead = units.slice(1);
  return ahead.length ? 1 + ahead.indexOf(Math.max(...ahead)) : 0;
}

/** "Saturday 21 November", from the forecast's own date, whatever clock the server keeps. */
export const dayName = (date: string): string => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).replace(',', '');

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Forecasts already fetched, by place, kept for half an hour: a second ask in the same call is then instant. */
const kept = new Map<string, { at: number; raw: { date: string; mj: number; rainChance?: number }[] }>();

async function forecastAt(lat: number, lon: number): Promise<{ date: string; mj: number; rainChance?: number }[]> {
  // To about a kilometre: finer than the forecast's own grid, and no more exact than it needs to be.
  const where = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const had = kept.get(where);
  if (had && Date.now() - had.at < 30 * 60_000) return had.raw;
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), 7000);
  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(2)}&longitude=${lon.toFixed(2)}&daily=shortwave_radiation_sum,precipitation_probability_max&timezone=auto&forecast_days=7`, { signal: stop.signal });
    if (!res.ok) throw new Error(`forecast ${res.status}`);
    const daily = ((await res.json()) as { daily?: { time?: string[]; shortwave_radiation_sum?: (number | null)[]; precipitation_probability_max?: (number | null)[] } }).daily ?? {};
    const raw = (daily.time ?? []).map((date, i) => ({ date, mj: Number(daily.shortwave_radiation_sum?.[i] ?? NaN), rainChance: daily.precipitation_probability_max?.[i] ?? undefined }));
    if (raw.filter((d) => Number.isFinite(d.mj)).length < 2) throw new Error('forecast empty');
    kept.set(where, { at: Date.now(), raw });
    return raw;
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch the week for the home, put it on the screen, and give the agent the days in words. */
export async function sunWeek(sid: string): Promise<Result> {
  const s = ensureSession(sid);
  if (!s.location) return { ok: false, error: 'No place is known yet.', next: 'Ask which town or city they are in, call setLocation, then call sunForecast again.' };
  let raw: Awaited<ReturnType<typeof forecastAt>>;
  try {
    raw = await forecastAt(s.location.lat, s.location.lon);
  } catch {
    return { ok: false, error: 'The weather forecast could not be fetched just now.', next: 'Say so in one sentence and offer to try again in a moment. Do not guess the weather.' };
  }
  const month = Number(raw[0].date.slice(5, 7)) - 1;
  const usualSunHours = s.location.source === 'nasa' && s.location.monthly?.length === 12 ? s.location.monthly[month] : undefined;
  const days = weekOutlook(raw, usualSunHours);
  const place = s.location.label;
  updateSession(
    sid,
    (x) => {
      x.week = { key: `${place}:${Date.now().toString(36)}`, place, days, usualSunHours, fetchedAt: Date.now() };
    },
    { kind: 'sunForecast', text: `Fetched this week's forecast for ${place}` },
  );
  // Read again: the tool may have worked a system out a moment ago.
  const design = ensureSession(sid).design;
  const kw = design?.kw ?? 1;
  const units = days.map((d) => unitsOn(kw, d.sunHours));
  // With no system, every figure carries what it is a figure of. In a real call "about 4.5
  // units, for one kilowatt" was read out as "your roof will make about 4.5 units".
  const each = design ? '' : ' from EACH kilowatt of panels';
  const line = (i: number) => `${dayName(days[i].date)}: about ${units[i]} units${each}, ${days[i].sky}${days[i].rainChance !== undefined && days[i].rainChance! >= 40 ? `, ${Math.round(days[i].rainChance!)}% chance of rain` : ''}`;
  // The best day still to come: today is given by itself, and by the time anyone asks, much of it has often gone.
  const best = bestAhead(units);
  const poorest = units.indexOf(Math.min(...units));
  const total = Math.round(units.reduce((a, b) => a + b, 0));
  return {
    ok: true,
    place,
    worked_out_for: design ? `the ${kw} kW system designed for this home` : 'ONE kilowatt of panels, because no system is designed yet and no bill is saved. It is NOT what their roof will make.',
    today: line(0),
    tomorrow: line(Math.min(1, days.length - 1)),
    the_week: days.map((_, i) => line(i)),
    best_day_ahead: line(best),
    poorest_day: line(poorest),
    ...(design ? { units_over_the_seven_days: total } : {}),
    ...(usualSunHours ? { a_usual_day_this_month: `about ${unitsOn(kw, usualSunHours)} units${each}, from the long-term average for ${MONTHS[month]}` } : {}),
    ...(design ? { worth_over_the_seven_days: `about ${Math.round(total * design.tariff).toLocaleString('en-IN')} rupees at the price they pay for a unit` } : {}),
    source: `A weather forecast from ${FORECAST_SOURCE}, turned into units with the same sum as the design. A forecast changes, and it cannot see the shade on one roof.`,
    next: `${design ? '' : 'No system is designed, so say "from each kilowatt of panels" with every number, never "your roof will make", and offer to work out their system from their bill. '}Answer the day they asked about in one short sentence, with its day name and units. Then name the best day ahead, and suggest running the heavy things (washing machine, pump, geyser) around midday that day. If rain is likely on the day they asked about, say so. The seven days are on the screen. Say once that it is a forecast.`,
  };
}
