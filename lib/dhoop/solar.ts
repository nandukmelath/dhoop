import { ASSUMPTIONS, PORTAL_SIZE_GUIDE, STANDARD_SIZES_KW, SUBSIDY } from './config';

/** Pure solar maths. No network, no state: easy to test and to trust. */

export interface DesignInput {
  /** Electricity used per month, in units (kWh). */
  monthlyUnits: number;
  /** What the household pays per month, in rupees. Optional. */
  billAmount?: number;
  /** Average peak sun hours per day at the location. */
  sunHours?: number;
  /** Usable roof capacity in kW, if the roof has been measured. */
  roofCapacityKw?: number;
  /** Force a size (kW) instead of recommending one. */
  targetKw?: number;
  /** Price per kW before subsidy, if a real quote is known. */
  costPerKw?: number;
}

export interface Design {
  kw: number;
  panels: number;
  /** Units the system makes per month, on average. */
  monthlyGeneration: number;
  annualGeneration: number;
  /** Units of the household's own use that solar replaces each month. */
  monthlyOffset: number;
  /** Share of the household's use covered, 0 to 1. */
  coverage: number;
  tariff: number;
  monthlySavings: number;
  billBefore: number;
  billAfter: number;
  grossCost: number;
  subsidy: number;
  netCost: number;
  paybackYears: number;
  co2TonnesPerYear: number;
  sunHours: number;
  /** True when the roof, not the bill, limited the size. */
  limitedByRoof: boolean;
  portalGuide: string;
  /** Plain-language notes on what was assumed. */
  notes: string[];
}

const round = (n: number, d = 0) => {
  const f = 10 ** d;
  return Math.round(n * f) / f;
};

/** Central subsidy for a system of the given size. Pro-rata inside each slab. */
export function subsidyForKw(kw: number): number {
  if (!(kw > 0)) return 0;
  const firstTwo = Math.min(kw, 2) * SUBSIDY.perKwFirstTwo;
  const third = Math.min(Math.max(kw - 2, 0), 1) * SUBSIDY.perKwThird;
  return Math.min(Math.round(firstTwo + third), SUBSIDY.cap);
}

/** Units one kW of panels makes per day at this location. */
export function dailyYieldPerKw(sunHours: number = ASSUMPTIONS.defaultSunHours): number {
  return sunHours * ASSUMPTIONS.performanceRatio;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS_IN = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * What a system makes in each month of the year, from the place's monthly sunshine: the answer
 * to "what about the monsoon?". Null without twelve real monthly figures. `monthlyUnits` is
 * what the home uses in a month; real use moves with the seasons too, and that is not known.
 */
export function throughTheYear(kw: number, monthlySunHours: number[], monthlyUnits: number) {
  if (!(kw > 0) || monthlySunHours.length !== 12 || monthlySunHours.some((h) => !(h > 0))) return null;
  const months = monthlySunHours.map((hours, i) => ({ name: MONTH_NAMES[i], made: Math.round(kw * dailyYieldPerKw(hours) * DAYS_IN[i]) }));
  const best = months.reduce((a, b) => (b.made > a.made ? b : a));
  const poorest = months.reduce((a, b) => (b.made < a.made ? b : a));
  return { months, best, poorest, monthsShort: monthlyUnits > 0 ? months.filter((m) => m.made < monthlyUnits).length : 0 };
}

/** How many kW a roof can carry, from its area and how much of it is shaded. */
export function roofCapacity(areaM2: number, shadeFraction: number): { usableM2: number; kw: number; panels: number } {
  const shade = Math.min(Math.max(shadeFraction || 0, 0), 0.95);
  const usableM2 = Math.max(areaM2, 0) * (1 - shade) * ASSUMPTIONS.usableRoofShare;
  const kw = usableM2 / ASSUMPTIONS.areaPerKwM2;
  return { usableM2: round(usableM2, 1), kw: round(kw, 2), panels: Math.floor((kw * 1000) / ASSUMPTIONS.panelWatts) };
}

/** The standard size closest to, and not above, a limit. Falls back to the smallest size. */
export function standardSizeAtMost(limitKw: number): number {
  let best: number = STANDARD_SIZES_KW[0];
  for (const s of STANDARD_SIZES_KW) if (s <= limitKw + 1e-9) best = s;
  return best;
}

/** The smallest standard size that covers the need, give or take 5%. */
export function standardSizeAtLeast(needKw: number): number {
  for (const s of STANDARD_SIZES_KW) if (s >= needKw * 0.95) return s;
  return STANDARD_SIZES_KW[STANDARD_SIZES_KW.length - 1];
}

export function portalGuideFor(monthlyUnits: number): string {
  return (PORTAL_SIZE_GUIDE.find((g) => monthlyUnits <= g.maxUnits) ?? PORTAL_SIZE_GUIDE[2]).label;
}

/**
 * The equal monthly instalment that repays a loan, interest included.
 * `ratePercentAYear` is the yearly rate, charged monthly on what is still owed.
 */
export function monthlyInstalment(principal: number, ratePercentAYear: number, months: number): number {
  if (principal <= 0) return 0;
  if (months <= 0) return principal;
  const r = ratePercentAYear / 100 / 12;
  if (r === 0) return principal / months;
  const growth = (1 + r) ** months;
  return (principal * r * growth) / (growth - 1);
}

export function tariffFromBill(monthlyUnits: number, billAmount?: number): number {
  if (billAmount && monthlyUnits > 0) {
    const t = billAmount / monthlyUnits;
    // A bill that implies a tariff outside this range was probably misread.
    if (t >= 2 && t <= 20) return round(t, 2);
  }
  return ASSUMPTIONS.defaultTariff;
}

export function designSystem(input: DesignInput): Design {
  const notes: string[] = [];
  const sunHours = input.sunHours && input.sunHours > 1 ? input.sunHours : ASSUMPTIONS.defaultSunHours;
  if (!(input.sunHours && input.sunHours > 1)) notes.push('Sunshine is a national average because the location is not set.');
  const perKwPerDay = dailyYieldPerKw(sunHours);
  const monthlyUnits = Math.max(input.monthlyUnits || 0, 0);

  const neededKw = monthlyUnits / (30.4 * perKwPerDay);
  let kw: number;
  let limitedByRoof = false;
  if (input.targetKw && input.targetKw > 0) {
    kw = input.targetKw;
  } else {
    kw = standardSizeAtLeast(Math.max(neededKw, 1));
  }
  if (input.roofCapacityKw !== undefined && input.roofCapacityKw > 0 && kw > input.roofCapacityKw) {
    kw = standardSizeAtMost(input.roofCapacityKw);
    limitedByRoof = true;
    notes.push('The roof, not the bill, limits the size.');
  }

  const tariff = tariffFromBill(monthlyUnits, input.billAmount);
  if (!input.billAmount) notes.push(`Tariff assumed at Rs ${ASSUMPTIONS.defaultTariff} a unit because the bill amount is unknown.`);
  const billBefore = input.billAmount && input.billAmount > 0 ? input.billAmount : monthlyUnits * tariff;

  const annualGeneration = kw * perKwPerDay * 365;
  const monthlyGeneration = annualGeneration / 12;
  const monthlyOffset = Math.min(monthlyGeneration, monthlyUnits);
  const fixed = billBefore * ASSUMPTIONS.fixedChargeShare;
  const monthlySavings = Math.min(monthlyOffset * tariff, Math.max(billBefore - fixed, 0));
  const billAfter = Math.max(billBefore - monthlySavings, 0);

  const costPerKw = input.costPerKw && input.costPerKw > 0 ? input.costPerKw : ASSUMPTIONS.costPerKw;
  if (input.costPerKw && input.costPerKw > 0) notes.push('Price is from the lowest installer quote.');
  else notes.push(`Price assumed at Rs ${costPerKw.toLocaleString('en-IN')} per kW until an installer quotes.`);
  notes.push('Savings assume net metering credits each unit at your current rate.');
  const grossCost = kw * costPerKw;
  const subsidy = subsidyForKw(kw);
  const netCost = Math.max(grossCost - subsidy, 0);
  const paybackYears = monthlySavings > 0 ? netCost / (monthlySavings * 12) : Infinity;

  return {
    kw,
    panels: Math.ceil((kw * 1000) / ASSUMPTIONS.panelWatts),
    monthlyGeneration: round(monthlyGeneration),
    annualGeneration: round(annualGeneration),
    monthlyOffset: round(monthlyOffset),
    coverage: monthlyUnits > 0 ? round(monthlyOffset / monthlyUnits, 2) : 0,
    tariff,
    monthlySavings: round(monthlySavings),
    billBefore: round(billBefore),
    billAfter: round(billAfter),
    grossCost: round(grossCost),
    subsidy,
    netCost: round(netCost),
    paybackYears: Number.isFinite(paybackYears) ? round(paybackYears, 1) : 99,
    co2TonnesPerYear: round((annualGeneration * ASSUMPTIONS.co2KgPerKwh) / 1000, 1),
    sunHours: round(sunHours, 2),
    limitedByRoof,
    portalGuide: portalGuideFor(monthlyUnits),
    notes,
  };
}

/** Area of a polygon given as [lat, lon] corners, in square metres (good for roofs, not for countries). */
export function polygonAreaM2(points: [number, number][]): number {
  if (points.length < 3) return 0;
  const lat0 = (points.reduce((s, p) => s + p[0], 0) / points.length) * (Math.PI / 180);
  const mPerDegLat = 111_132;
  const mPerDegLon = 111_320 * Math.cos(lat0);
  const xy = points.map(([lat, lon]) => [lon * mPerDegLon, lat * mPerDegLat]);
  let twice = 0;
  for (let i = 0; i < xy.length; i++) {
    const [x1, y1] = xy[i];
    const [x2, y2] = xy[(i + 1) % xy.length];
    twice += x1 * y2 - x2 * y1;
  }
  return Math.abs(twice) / 2;
}

/** Rupees in the Indian style: 1,62,000. */
export function inr(n: number): string {
  return '₹' + Math.round(n).toLocaleString('en-IN');
}
