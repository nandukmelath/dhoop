import { LOAN, SQFT_PER_M2, type Lang } from './config';
import { designSystem, monthlyInstalment, roofCapacity } from './solar';
import type { Session } from './store';

/**
 * Households that do not exist, for showing an installer what a full inbox looks like.
 *
 * Only what each one "did" is written here: the bill, the roof, what was asked, how far the
 * application has got. Everything shown about them (the system, the money, the rating, the
 * reasons, the opening line) is then worked out by the same code that rates a real
 * conversation, so a sample can never show a rating the app would not give.
 *
 * Every id begins with "sample-", the installers' page marks each one "Sample", and none of
 * them is ever written to the store or counted with real households. Do not give one a
 * person's name or a phone number.
 */
interface Sample {
  id: string;
  place: string;
  lang: Lang;
  units: number;
  bill: number;
  sunHours: number;
  roofSqft: number;
  shade: number;
  /** The person redrew the roof themselves. */
  corrected?: boolean;
  /** How many of the portal's ten stages are behind them. */
  stages?: number;
  /** The four subsidy conditions: all met, the bank's name differs, or never asked. */
  conditions?: 'met' | 'bank';
  loan?: boolean;
  compare?: boolean;
  longRun?: boolean;
  vendors?: boolean;
  /** Asked for quotes, so installers may see the whole household. */
  survey?: boolean;
  quote?: number;
  visit?: [day: string, time: string];
  /** The tools the conversation used, in order. */
  asked: string[];
  hoursAgo: number;
}

const SAMPLES: Sample[] = [
  { id: 'sample-whitefield', place: 'Whitefield, Bengaluru', lang: 'kn', units: 600, bill: 4800, sunHours: 5.48, roofSqft: 1150, shade: 0.08, stages: 3, conditions: 'met', loan: true, survey: true, quote: 285000, visit: ['Saturday', '10 am'], asked: ['saveBill', 'findMyRoof', 'designSolar', 'checkEligibility', 'subsidySteps', 'loanPlan', 'requestQuotes', 'getQuotes', 'bookVisit'], hoursAgo: 2 },
  { id: 'sample-hsr', place: 'HSR Layout, Bengaluru', lang: 'en', units: 520, bill: 4400, sunHours: 5.48, roofSqft: 1400, shade: 0.05, corrected: true, conditions: 'met', loan: true, longRun: true, survey: true, asked: ['saveBill', 'findMyRoof', 'changeRoof', 'designSolar', 'longRunSavings', 'checkEligibility', 'loanPlan', 'requestQuotes'], hoursAgo: 1 },
  { id: 'sample-kakkanad', place: 'Kakkanad, Kochi', lang: 'ml', units: 400, bill: 3200, sunHours: 5.2, roofSqft: 800, shade: 0.1, stages: 2, conditions: 'met', compare: true, vendors: true, survey: true, asked: ['saveBill', 'findBuilding', 'designSolar', 'compareSizes', 'checkEligibility', 'subsidySteps', 'findVendors', 'requestQuotes'], hoursAgo: 5 },
  { id: 'sample-gachibowli', place: 'Gachibowli, Hyderabad', lang: 'te', units: 480, bill: 3900, sunHours: 5.4, roofSqft: 950, shade: 0.12, conditions: 'bank', survey: true, asked: ['saveBill', 'findMyRoof', 'designSolar', 'checkEligibility', 'requestQuotes'], hoursAgo: 3 },
  { id: 'sample-jaipur', place: 'Vaishali Nagar, Jaipur', lang: 'hi', units: 300, bill: 2400, sunHours: 5.6, roofSqft: 700, shade: 0.1, survey: true, asked: ['saveBill', 'setLocation', 'setRoofManual', 'designSolar', 'requestQuotes'], hoursAgo: 8 },
  { id: 'sample-mysuru', place: 'Kuvempunagar, Mysuru', lang: 'kn', units: 350, bill: 2700, sunHours: 5.5, roofSqft: 900, shade: 0.1, stages: 5, conditions: 'met', survey: true, asked: ['saveBill', 'findMyRoof', 'designSolar', 'subsidySteps', 'requestQuotes'], hoursAgo: 20 },
  // These three have not asked for quotes, so an installer sees a town, a size and a rating only.
  { id: 'sample-jayanagar', place: 'Jayanagar, Bengaluru', lang: 'en', units: 700, bill: 6500, sunHours: 5.48, roofSqft: 1600, shade: 0.06, corrected: true, conditions: 'met', loan: true, compare: true, longRun: true, vendors: true, asked: ['saveBill', 'findMyRoof', 'changeRoof', 'designSolar', 'compareSizes', 'longRunSavings', 'checkEligibility', 'loanPlan', 'findVendors'], hoursAgo: 1 },
  { id: 'sample-annanagar', place: 'Anna Nagar, Chennai', lang: 'ta', units: 380, bill: 2900, sunHours: 5.3, roofSqft: 850, shade: 0.1, longRun: true, asked: ['saveBill', 'findMyRoof', 'designSolar', 'longRunSavings', 'sunForecast'], hoursAgo: 4 },
  { id: 'sample-indiranagar', place: 'Indiranagar, Bengaluru', lang: 'en', units: 0, bill: 0, sunHours: 5.48, roofSqft: 1000, shade: 0.1, asked: ['findMyRoof', 'showNeighbourhood'], hoursAgo: 6 },
];

/** The sample households as sessions, so the rating code reads them exactly as it reads a real one. */
export function sampleSessions(now: number = Date.now()): Session[] {
  return SAMPLES.map((p) => {
    const areaM2 = p.roofSqft / SQFT_PER_M2;
    const fits = roofCapacity(areaM2, p.shade);
    const sized = p.units > 0 ? designSystem({ monthlyUnits: p.units, billAmount: p.bill, sunHours: p.sunHours, roofCapacityKw: fits.kw }) : undefined;
    // Once an installer has quoted, the price is the quote's, as it is for a real household.
    const design = sized && p.quote ? designSystem({ monthlyUnits: p.units, billAmount: p.bill, sunHours: p.sunHours, roofCapacityKw: fits.kw, costPerKw: p.quote / sized.kw }) : sized;
    const smaller = design && design.kw > 1 ? designSystem({ monthlyUnits: p.units, billAmount: p.bill, sunHours: p.sunHours, targetKw: design.kw - 1 }) : undefined;
    const borrowed = design ? Math.min(LOAN.maxAmount, Math.round(design.grossCost * (1 - LOAN.ownShare))) : 0;
    const at = now - p.hoursAgo * 3_600_000;
    const answers = p.conditions ? { home: 'yes', name: 'yes', bank: p.conditions === 'bank' ? 'no' : 'yes', roof: 'yes' } : undefined;
    return {
      id: p.id,
      lang: p.lang,
      createdAt: at - 12 * 60_000,
      updatedAt: at,
      rev: 1,
      view: design ? 'design' : 'roof',
      location: { label: p.place, lat: 0, lon: 0, sunHours: p.sunHours, monthly: [], source: 'nasa' },
      bill: p.units > 0 ? { monthlyUnits: p.units, amount: p.bill, tariff: Math.round((p.bill / p.units) * 100) / 100, source: 'spoken' } : undefined,
      roof: { areaM2, shadeFraction: p.shade, capacityKw: fits.kw, panelsFit: fits.panels, source: 'found', foundBy: p.corrected ? 'voice' : 'device' },
      design,
      compare: p.compare && design && smaller ? { a: design, b: smaller } : undefined,
      application: p.stages || answers ? { eligibility: answers, stagesDone: p.stages ?? 0, updatedAt: at } : undefined,
      loan: p.loan && design ? { cost: design.grossCost, amount: borrowed, own: design.grossCost - borrowed, years: LOAN.maxYears, instalment: Math.round(monthlyInstalment(borrowed, LOAN.ratePercentAYear, LOAN.maxYears * 12)), instalmentAfterSubsidy: Math.round(monthlyInstalment(Math.max(borrowed - design.subsidy, 0), LOAN.ratePercentAYear, LOAN.maxYears * 12)), saving: design.monthlySavings } : undefined,
      longRun: p.longRun ? { key: p.id, priceRisePercent: 0 } : undefined,
      vendors: p.vendors ? { key: p.id, askedFor: p.place } : undefined,
      survey: p.survey && design ? { id: `${p.id}-survey`, homeowner: 'Sample household', sentAt: at, kw: design.kw } : undefined,
      quotes: p.quote ? [{ id: `${p.id}-quote`, installer: 'Sample installer', price: p.quote, days: 9, at }] : [],
      booking: p.visit ? { id: `${p.id}-visit`, installer: 'Sample installer', day: p.visit[0], time: p.visit[1] } : undefined,
      log: p.asked.map((kind, i) => ({ t: at - (p.asked.length - i) * 60_000, kind, text: kind })),
    } as unknown as Session;
  });
}
