import { LONG_RUN } from './config';

/**
 * The long view: a home system bought today, followed for its 25 years.
 *
 * The design says "pays back in 3.1 years". This says what happens after that, which is where
 * most of the money is. Each year the panels make a little less (the fade in `LONG_RUN`), and
 * the saving follows. The price of electricity stays as it is today unless the person asks
 * "what if it rises five percent a year", in which case that is their figure, not Dhoop's.
 *
 * Left out, and said so wherever this is shown: cleaning, a new inverter after ten years or
 * so, and the interest on a loan. So the true figure is somewhat lower.
 *
 * Safe to import from a screen: plain sums.
 */
export interface LongRun {
  /** The yearly rise in the price of electricity that was used, in percent. Nought means today's price throughout. */
  priceRisePercent: number;
  /** Rupees ahead, or behind when negative, at the end of each year. The first entry is the day it is bought. */
  position: number[];
  /** What it saves in each year, the first year first. */
  savedInYear: number[];
  /** Years until it has paid for itself, to one decimal. Null when it never does in 25 years. */
  paysBackIn: number | null;
  /** Everything saved over the 25 years, before taking the cost off. */
  savedInAll: number;
  /** How far ahead the household is at the end, the cost taken off. */
  aheadAtEnd: number;
  /** Years of electricity it gives after it has paid for itself. */
  freeYears: number;
}

export function longRun(netCost: number, monthlySavings: number, priceRisePercent = 0): LongRun {
  const rise = Math.min(LONG_RUN.mostPriceRisePercent, Math.max(0, Number.isFinite(priceRisePercent) ? priceRisePercent : 0));
  const cost = Math.max(0, netCost);
  const position = [-Math.round(cost)];
  const savedInYear: number[] = [];
  let paysBackIn: number | null = cost === 0 ? 0 : null;
  let at = -cost;
  let savedInAll = 0;
  for (let year = 1; year <= LONG_RUN.years; year++) {
    const stillMakes = Math.max(0, 1 - (LONG_RUN.fadePercentAYear / 100) * (year - 1));
    const saved = Math.max(0, monthlySavings) * 12 * stillMakes * Math.pow(1 + rise / 100, year - 1);
    // The moment it crosses from owing to ahead, taken as falling evenly through that year.
    if (paysBackIn === null && saved > 0 && at + saved >= 0) paysBackIn = Math.round((year - 1 + -at / saved) * 10) / 10;
    at += saved;
    savedInAll += saved;
    savedInYear.push(Math.round(saved));
    position.push(Math.round(at));
  }
  return {
    priceRisePercent: rise,
    position,
    savedInYear,
    paysBackIn,
    savedInAll: Math.round(savedInAll),
    aheadAtEnd: position[LONG_RUN.years],
    freeYears: paysBackIn === null ? 0 : Math.round((LONG_RUN.years - paysBackIn) * 10) / 10,
  };
}

/** Rupees in the words people use for large sums: "7.4 lakh", "1.2 crore", and plain thousands below a lakh. */
export function inLakh(rupees: number): string {
  const n = Math.abs(rupees);
  const sign = rupees < 0 ? 'minus ' : '';
  const short = (x: number) => (Math.round(x * 10) / 10).toString();
  if (n >= 1e7) return `${sign}${short(n / 1e7)} crore`;
  if (n >= 1e5) return `${sign}${short(n / 1e5)} lakh`;
  return `${sign}${(Math.round(n / 1000) * 1000).toLocaleString('en-IN')}`;
}
