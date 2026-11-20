import { APPLIANCES, ASSUMPTIONS, USUAL_LOAD } from './config';

/**
 * The sums behind "what is the roof making right now, and what does that cover": sunshine in
 * watts a square metre to kilowatts for a system, the best hour of a day, and which household
 * things that much power carries. The lookup that feeds them is in `today.ts`.
 *
 * Safe to import from a screen: plain sums over `config.ts`.
 */

/** Kilowatts a system of that size makes under that much sunshine, to two decimals. */
export const powerFrom = (kw: number, wattsPerM2: number): number => Math.round(kw * (Math.max(0, wattsPerM2) / 1000) * ASSUMPTIONS.performanceRatio * 100) / 100;

/** Units a system makes over a day with those hourly averages of sunshine, to a tenth. */
export const unitsFromHours = (kw: number, hours: number[]): number => Math.round(hours.reduce((sum, w) => sum + powerFrom(kw, w), 0) * 10) / 10;

/** The hour with the most sunshine: the hour it ends at, and its watts a square metre. */
export function bestHour(hours: number[]): { hour: number; watts: number } {
  const watts = Math.max(0, ...hours);
  return { hour: Math.max(0, hours.indexOf(watts)), watts };
}

/** "12 noon", "2 pm", "6:20 am": a clock time the way it is said. */
export function clockSaid(hour: number, minute = 0): string {
  const h = ((Math.round(hour) % 24) + 24) % 24;
  if (h === 12 && minute === 0) return '12 noon';
  if (h === 0 && minute === 0) return 'midnight';
  return `${h % 12 === 0 ? 12 : h % 12}${minute ? `:${String(minute).padStart(2, '0')}` : ''} ${h < 12 ? 'am' : 'pm'}`;
}

/** Which appliances a sentence names, by key, each once. "none" and silence name nothing. */
export function appliancesSaid(said: string): string[] {
  return APPLIANCES.filter((a) => a.said.test(said)).map((a) => a.key);
}

const byKey = (key: string) => APPLIANCES.find((a) => a.key === key)!;

/**
 * What an ordinary home's things the power covers, running together: the fridge first, then
 * the fans, and so on up the list for as long as there is power for the next one.
 */
export function usualCovered(powerKw: number): { names: string[]; watts: number } {
  let left = powerKw * 1000;
  const names: string[] = [];
  let watts = 0;
  for (const item of USUAL_LOAD) {
    const a = byKey(item.key);
    const need = a.watts * item.count;
    if (need > left) break;
    left -= need;
    watts += need;
    names.push(item.count > 1 ? `${item.count === 3 ? 'three' : item.count} ${a.name}s` : `the ${a.name}`);
  }
  return { names, watts };
}

/** The appliances asked about, what they draw together, and the share of that the power covers, nought to one. */
export function askedCovered(powerKw: number, keys: string[]): { names: string[]; watts: number; share: number } {
  const picked = keys.map(byKey).filter(Boolean);
  const watts = picked.reduce((sum, a) => sum + a.watts, 0);
  return { names: picked.map((a) => a.name), watts, share: watts > 0 ? Math.min(1, (powerKw * 1000) / watts) : 0 };
}

/** A share in the words a person uses: "all of it", "most of it", "about two thirds of it", "about half of it", and so on down to "none of it". */
export function shareSaid(share: number): string {
  if (share >= 0.95) return 'all of it';
  if (share >= 0.8) return 'most of it';
  if (share >= 0.58) return 'about two thirds of it';
  if (share >= 0.42) return 'about half of it';
  if (share >= 0.28) return 'about a third of it';
  if (share >= 0.18) return 'about a quarter of it';
  return share > 0 ? 'only a little of it' : 'none of it';
}
