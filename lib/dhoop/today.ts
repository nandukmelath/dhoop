import { appliancesSaid, askedCovered, bestHour, clockSaid, powerFrom, shareSaid, unitsFromHours, usualCovered } from './power';
import { ensureSession, updateSession, type RoofNow } from './store';

/**
 * The roof at this moment: "what is it making right now, and can it run my AC?"
 *
 * The week's forecast is about days. This is about the hour: the sunshine reaching the ground
 * now and through today, from the same weather service, turned into kilowatts with the same
 * share the design uses (`performanceRatio`). It is the one figure that changes while a
 * person watches, and the one a household feels: at two in the afternoon the panels carry the
 * fridge, the fans and the washing machine, and at eight in the evening nothing.
 *
 * One thing the answer must never get wrong: a home with rooftop solar is still on the grid,
 * so every appliance RUNS at every hour. The sun only decides how much of it is paid for.
 *
 * The sums are in `power.ts`, which a screen may import. This file writes the session.
 */

type Result = Record<string, unknown>;

const kept = new Map<string, { at: number; got: Omit<RoofNow, 'key' | 'place' | 'asked' | 'fetchedAt'> }>();

async function sunToday(lat: number, lon: number): Promise<Omit<RoofNow, 'key' | 'place' | 'asked' | 'fetchedAt'>> {
  const where = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const had = kept.get(where);
  // "Right now" goes stale fast: ten minutes, which is finer than the service's own quarter of an hour.
  if (had && Date.now() - had.at < 10 * 60_000) return had.got;
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), 7000);
  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(2)}&longitude=${lon.toFixed(2)}&current=shortwave_radiation,is_day&hourly=shortwave_radiation&daily=sunrise,sunset&timezone=auto&forecast_days=1`, { signal: stop.signal });
    if (!res.ok) throw new Error(`weather ${res.status}`);
    const j = (await res.json()) as {
      current?: { time?: string; shortwave_radiation?: number | null; is_day?: number };
      hourly?: { shortwave_radiation?: (number | null)[] };
      daily?: { sunrise?: string[]; sunset?: string[] };
    };
    const hours = (j.hourly?.shortwave_radiation ?? []).slice(0, 24).map((w) => Math.max(0, Number(w ?? 0)));
    if (hours.length < 24 || !j.current?.time) throw new Error('weather empty');
    const got = {
      at: j.current.time,
      isDay: j.current.is_day === 1,
      sunNow: Math.max(0, Number(j.current.shortwave_radiation ?? 0)),
      hours,
      sunrise: j.daily?.sunrise?.[0]?.slice(11, 16),
      sunset: j.daily?.sunset?.[0]?.slice(11, 16),
    };
    kept.set(where, { at: Date.now(), got });
    return got;
  } finally {
    clearTimeout(timer);
  }
}

const listed = (names: string[]) => (names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);
const clockOf = (hhmm?: string) => (hhmm && /^\d\d:\d\d$/.test(hhmm) ? clockSaid(Number(hhmm.slice(0, 2)), Number(hhmm.slice(3))) : undefined);
const kilowatts = (kw: number) => (kw >= 1 ? `about ${Math.round(kw * 10) / 10} kilowatts` : `about ${Math.round(kw * 100) * 10} watts`);

/** Fetch today for the home, put it on the screen, and say what the roof makes now and what that covers. */
export async function roofNow(sid: string, said: string): Promise<Result> {
  const s = ensureSession(sid);
  if (!s.location) return { ok: false, error: 'No place is known yet.', next: 'Ask which town or city they are in, call setLocation, then call powerNow again.' };
  let got: Awaited<ReturnType<typeof sunToday>>;
  try {
    got = await sunToday(s.location.lat, s.location.lon);
  } catch {
    return { ok: false, error: 'The weather could not be fetched just now.', next: 'Say so in one sentence and offer to try again in a moment. Do not guess.' };
  }
  const asked = appliancesSaid(said);
  const place = s.location.label;
  updateSession(
    sid,
    (x) => {
      x.now = { key: `${place}:${Date.now().toString(36)}`, place, ...got, asked: asked.length ? asked : undefined, fetchedAt: Date.now() };
    },
    { kind: 'powerNow', text: `Looked up what the sun is doing in ${place} right now` },
  );
  const design = ensureSession(sid).design;
  const kw = design?.kw ?? 1;
  const each = design ? '' : ' from EACH kilowatt of panels';
  const now = powerFrom(kw, got.sunNow);
  const peak = bestHour(got.hours);
  // The reading for this moment can stand a little above the best hour's average: the best is then now.
  const peakKw = Math.max(powerFrom(kw, peak.watts), now);
  const usual = usualCovered(now);
  const wanted = asked.length ? askedCovered(now, asked) : undefined;
  const wantedAtBest = asked.length ? askedCovered(peakKw, asked) : undefined;
  const time = clockSaid(Number(got.at.slice(11, 13)), Number(got.at.slice(14, 16)));
  const up = got.isDay && now > 0;
  return {
    ok: true,
    place,
    as_of: time,
    worked_out_for: design ? `the ${kw} kW system designed for this home` : 'ONE kilowatt of panels, because no system is designed yet and no bill is saved. It is NOT what their roof makes.',
    making_right_now: up ? `${kilowatts(now)}${each}` : `nothing at this moment: the sun is down${clockOf(got.sunrise) ? `. It comes up at about ${clockOf(got.sunrise)}` : ''}`,
    ...(design && up ? { that_covers_right_now: usual.names.length ? `${listed(usual.names)}, running together` : 'less than the fridge draws: it is early, late or cloudy' } : {}),
    ...(design && wanted && wantedAtBest
      ? {
          they_asked_about: {
            appliances: `${listed(wanted.names)}: about ${(wanted.watts / 1000).toFixed(1).replace(/\.0$/, '')} kilowatts${wanted.names.length > 1 ? ' together' : ''}, by typical ratings`,
            it_runs: 'YES, at any hour. The home stays on the grid, which supplies whatever the panels do not. Never say it cannot run.',
            the_sun_covers_right_now: up ? shareSaid(wanted.share) : 'none of it: the sun is down, so the grid runs it',
            at_todays_best_hour: `${shareSaid(wantedAtBest.share)}, around ${clockSaid(peak.hour - 1)} to ${clockSaid(peak.hour)}`,
          },
        }
      : {}),
    today: `about ${unitsFromHours(kw, got.hours)} units in all${each}; the most between ${clockSaid(peak.hour - 1)} and ${clockSaid(peak.hour)}, ${kilowatts(peakKw)}${clockOf(got.sunrise) && clockOf(got.sunset) ? `; the sun is up from about ${clockOf(got.sunrise)} to ${clockOf(got.sunset)}` : ''}`,
    how_it_works: "What the panels make comes off the bill. What they make beyond the home's use goes to the grid and is credited by net metering, and at night the home draws from the grid as before.",
    source: "Sunshine reaching the ground now and through today, from Open-Meteo (open-meteo.com), with the same share lost to heat and wiring as the design. Appliance figures are typical ratings: the label has the real one. It cannot see the shade on one roof.",
    next: `${design ? '' : 'No system is designed, so say "from each kilowatt of panels" with every number and offer to work out their system from their bill. '}${asked.length ? 'Answer the appliance first: it runs, and say how much of it the sun is covering at this moment, then at the best hour today. ' : 'Say what it is making at this moment in one short sentence, then what that covers. '}Then the best hour today, briefly. The day is on the screen, hour by hour.`,
  };
}
