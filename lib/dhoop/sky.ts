/**
 * A second opinion on the sky, for when the weather service will not answer.
 *
 * Open-Meteo counts requests by the address they come from, and a free host shares its
 * address with many other servers. On 20 Nov 2026 the hosted copy was refused every time
 * while the same request worked from a laptop: "what will my roof make tomorrow" and "what
 * is it making right now" both failed for anyone using the public link.
 *
 * So the forecast has a second source that shares nothing with the first. MET Norway
 * (api.met.no) gives cloud cover by the hour for anywhere on earth. Where the sun stands in
 * the sky is arithmetic; what a clear sky delivers follows from it (Haurwitz, 1945); and
 * cloud takes its share away (Kasten and Czeplak, 1980). The answer is an estimate and is
 * labelled as one wherever it is shown.
 *
 * India keeps one clock, and Dhoop is for India, so days and hours here are in Indian time.
 */

/** Cloud cover at a moment: `at` in milliseconds, `cloud` as a percentage of the sky. */
export interface SkyPoint {
  at: number;
  cloud: number;
}

export const SECOND_SOURCE = 'MET Norway (api.met.no), worked out from its cloud forecast';

const DEG = Math.PI / 180;
const INDIA_MS = 330 * 60_000;
const DAY_MS = 86_400_000;
/** The sun counts as up from a little below the level horizon: the air bends its light, and its disc has a width. */
const HORIZON = Math.cos(90.833 * DEG);

/** How high the sun stands at a moment and place: the cosine of its angle from straight overhead. 1 is overhead, 0 the horizon. */
export function sunHeight(atMs: number, lat: number, lon: number): number {
  const d = new Date(atMs);
  const dayOfYear = Math.floor((atMs - Date.UTC(d.getUTCFullYear(), 0, 0)) / DAY_MS);
  const hours = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
  const year = ((2 * Math.PI) / 365) * (dayOfYear - 1 + (hours - 12) / 24);
  // How far the sun's clock runs ahead of an even one, in minutes, and how far north of the equator the sun stands.
  const ahead = 229.18 * (0.000075 + 0.001868 * Math.cos(year) - 0.032077 * Math.sin(year) - 0.014615 * Math.cos(2 * year) - 0.040849 * Math.sin(2 * year));
  const north = 0.006918 - 0.399912 * Math.cos(year) + 0.070257 * Math.sin(year) - 0.006758 * Math.cos(2 * year) + 0.000907 * Math.sin(2 * year) - 0.002697 * Math.cos(3 * year) + 0.00148 * Math.sin(3 * year);
  const sunMinutes = hours * 60 + ahead + 4 * lon;
  const fromNoon = (sunMinutes / 4 - 180) * DEG;
  return Math.sin(lat * DEG) * Math.sin(north) + Math.cos(lat * DEG) * Math.cos(north) * Math.cos(fromNoon);
}

/** Sunshine reaching flat ground under a clear sky, in watts a square metre. */
export const clearSkyWatts = (height: number): number => (height > 0.01 ? 1098 * height * Math.exp(-0.059 / height) : 0);

/** What is left of it under cloud. A fully overcast sky still passes a quarter. */
export const underCloud = (watts: number, cloudPercent: number): number => watts * (1 - 0.75 * Math.pow(Math.min(1, Math.max(0, cloudPercent / 100)), 3.4));

/** Cloud cover at any moment: a straight line between the two forecast points either side of it. */
export function cloudAt(points: SkyPoint[], atMs: number): number {
  if (!points.length) return 0;
  if (atMs <= points[0].at) return points[0].cloud;
  if (atMs >= points[points.length - 1].at) return points[points.length - 1].cloud;
  let i = 1;
  while (points[i].at < atMs) i++;
  const before = points[i - 1];
  const after = points[i];
  return before.cloud + ((after.cloud - before.cloud) * (atMs - before.at)) / (after.at - before.at);
}

const sunWatts = (points: SkyPoint[], atMs: number, lat: number, lon: number) => underCloud(clearSkyWatts(sunHeight(atMs, lat, lon)), cloudAt(points, atMs));
/** The moment the Indian day that holds `atMs` began. */
const dayStart = (atMs: number) => Math.floor((atMs + INDIA_MS) / DAY_MS) * DAY_MS - INDIA_MS;
/** A moment as Indian date and time: "2026-11-21T14:15". */
const stamp = (atMs: number) => new Date(atMs + INDIA_MS).toISOString().slice(0, 16);

/** Seven days from today: each day's sunshine on flat ground, in megajoules a square metre. */
export function weekOf(points: SkyPoint[], lat: number, lon: number, now: number, days = 7): { date: string; mj: number; rainChance?: number }[] {
  const first = dayStart(now);
  return Array.from({ length: days }, (_, d) => {
    const start = first + d * DAY_MS;
    let joules = 0;
    // A reading every quarter of an hour, taken at its middle.
    for (let q = 0; q < 96; q++) joules += sunWatts(points, start + (q + 0.5) * 900_000, lat, lon) * 900;
    return { date: stamp(start).slice(0, 10), mj: Math.round(joules / 10_000) / 100 };
  });
}

/** Today hour by hour and at this moment, in the shape the first source gives. Hours already gone take the cloud of the earliest forecast point. */
export function todayOf(points: SkyPoint[], lat: number, lon: number, now: number): { at: string; isDay: boolean; sunNow: number; hours: number[]; sunrise?: string; sunset?: string } {
  const start = dayStart(now);
  const hours = Array.from({ length: 24 }, (_, h) => {
    let sum = 0;
    for (const minute of [7.5, 22.5, 37.5, 52.5]) sum += sunWatts(points, start + (h - 1) * 3_600_000 + minute * 60_000, lat, lon);
    return Math.round((sum / 4) * 10) / 10;
  });
  let rise: number | undefined;
  let set: number | undefined;
  for (let minute = 0; minute < 1440; minute++) {
    if (sunHeight(start + minute * 60_000, lat, lon) <= HORIZON) continue;
    rise ??= minute;
    set = minute + 1;
  }
  const clock = (minute?: number) => (minute === undefined ? undefined : `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`);
  return { at: stamp(now), isDay: sunHeight(now, lat, lon) > HORIZON, sunNow: Math.round(sunWatts(points, now, lat, lon)), hours, sunrise: clock(rise), sunset: clock(set) };
}

const kept = new Map<string, { at: number; points: SkyPoint[] }>();

/** The cloud forecast for a place, hour by hour for two days and then every six hours. Kept for half an hour, as its publisher asks. */
export async function cloudsAt(lat: number, lon: number): Promise<SkyPoint[]> {
  const where = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const had = kept.get(where);
  if (had && Date.now() - had.at < 30 * 60_000) return had.points;
  // MET Norway asks every caller to say who it is. The address is the app's own public one.
  const res = await fetch(`https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat.toFixed(2)}&lon=${lon.toFixed(2)}`, { headers: { 'User-Agent': 'Dhoop/1.0 (+https://dhoop.onrender.com)' }, signal: AbortSignal.timeout(7000) });
  if (!res.ok) throw new Error(`clouds ${res.status}`);
  const series = ((await res.json()) as { properties?: { timeseries?: { time?: string; data?: { instant?: { details?: { cloud_area_fraction?: number } } } }[] } }).properties?.timeseries ?? [];
  const points = series.map((p) => ({ at: Date.parse(p.time ?? ''), cloud: Number(p.data?.instant?.details?.cloud_area_fraction) })).filter((p) => Number.isFinite(p.at) && Number.isFinite(p.cloud));
  if (points.length < 24) throw new Error('clouds empty');
  kept.set(where, { at: Date.now(), points });
  if (kept.size > 200) kept.delete(kept.keys().next().value as string);
  return points;
}

// When the first source has just refused, do not make the next person wait for it to refuse again.
const first = globalThis as unknown as { __dhoopWeatherRefusedAt?: number };
export const noteFirstRefused = (): void => void (first.__dhoopWeatherRefusedAt = Date.now());
/** True when the first source should be skipped: it refused in the last ten minutes, or DHOOP_WEATHER=clouds asks for the second (to test it). */
export const skipFirst = (): boolean => process.env.DHOOP_WEATHER === 'clouds' || Date.now() - (first.__dhoopWeatherRefusedAt ?? 0) < 10 * 60_000;
