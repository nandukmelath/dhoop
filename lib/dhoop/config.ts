/**
 * Every number Dhoop relies on, in one place, with where it came from.
 * Change a value here and the whole app (agent, screens, tests) follows.
 */

/** Central subsidy for residential rooftop solar under PM Surya Ghar: Muft Bijli Yojana.
 *  Source: National Portal for Rooftop Solar, https://pmsuryaghar.gov.in/ (read 19 Nov 2026):
 *  Rs. 30,000 per kW up to 2 kW, Rs. 18,000 per kW for additional capacity up to 3 kW,
 *  total capped at Rs. 78,000 for systems larger than 3 kW. */
export const SUBSIDY = {
  perKwFirstTwo: 30_000,
  perKwThird: 18_000,
  cap: 78_000,
  /** The portal shows the scheme closing on this date. */
  schemeCloses: '2027-03-31',
  source: 'https://pmsuryaghar.gov.in/',
} as const;

/**
 * The scheme's standard bank loan, for a loan of up to Rs 2 lakh, as the portal's "Financing
 * Options" page gives it (https://pmsuryaghar.gov.in/#/consumer-financing-options, read
 * 20 Nov 2026). The rate floats: the Reserve Bank's repo rate plus half a percent, which was
 * 6.00% a year on that day. No income proof or PAN is asked for at this size, and the
 * processing fee is nil.
 */
export const LOAN = {
  maxAmount: 200_000,
  /** The share of the project cost the borrower must pay themselves, at the least. */
  ownShare: 0.1,
  ratePercentAYear: 6.0,
  maxYears: 10,
  /** Months after the money is paid out before the first instalment falls due. */
  monthsBeforeFirstInstalment: 6,
  source: 'https://pmsuryaghar.gov.in/#/consumer-financing-options',
  readOn: '20 Nov 2026',
} as const;

/** How far the scheme has come, from the counters on the portal's home page. */
export const SCHEME_PROGRESS = {
  applications: 6_858_408,
  installations: 4_310_354,
  asOn: '19 Nov 2026',
} as const;

/** The portal's own guidance table: monthly units -> suitable plant size. */
export const PORTAL_SIZE_GUIDE = [
  { maxUnits: 150, label: '1 to 2 kW' },
  { maxUnits: 300, label: '2 to 3 kW' },
  { maxUnits: Infinity, label: 'above 3 kW' },
] as const;

/** Engineering assumptions. These are estimates, shown as such on screen. */
export const ASSUMPTIONS = {
  /** Share of sunshine that becomes usable electricity after heat, dust, wiring and inverter losses. */
  performanceRatio: 0.75,
  /** Peak sun hours per day used when NASA data cannot be fetched (India-wide ballpark). */
  defaultSunHours: 5.0,
  /** Rated power of one modern panel, in watts. */
  panelWatts: 540,
  /** Roof area needed per kW including gaps between rows (about 100 sq ft). */
  areaPerKwM2: 9.3,
  /** Share of an unshaded roof that can really carry panels (parapet setback, walkways). */
  usableRoofShare: 0.8,
  /** Installed price per kW before subsidy. An ASSUMPTION until a real installer quote arrives. */
  costPerKw: Number(process.env.DHOOP_COST_PER_KW ?? 60_000),
  /** Tariff used when the bill does not let us work one out (Rs per unit). */
  defaultTariff: 7,
  /** Grid emission factor, kg CO2 per kWh (approximate, Central Electricity Authority baseline). */
  co2KgPerKwh: 0.71,
  /** Part of a bill that solar cannot remove (fixed charges), as a share of the bill. */
  fixedChargeShare: 0.15,
} as const;

/** The long view of a home system: where the household stands after each of its 25 years. */
export const LONG_RUN = {
  /** How long panels are warranted for, and so how far the sum runs. */
  years: 25,
  /**
   * How much less the panels make each year, as a percent of what they made in the first.
   * Panels are commonly warranted to give at least 80% of their rated output after 25 years:
   * a fall of 0.8% a year in a straight line. That is the warranty's floor, so a cautious figure.
   */
  fadePercentAYear: 0.8,
  /** The steepest yearly rise in the price of electricity the sum will take. A "what if" the person asks for, never a forecast of Dhoop's own. */
  mostPriceRisePercent: 10,
};

/** Megajoules of sunshine on a square metre that make one kilowatt-hour: the weather forecast speaks in the first, panels in the second. */
export const MJ_PER_KWH = 3.6;

/**
 * What common household things draw while they run, in watts. Typical ratings, for saying what
 * a system's output covers at a given moment: the label on the appliance has the real figure.
 * `said` is how the thing is named when a person asks about it.
 */
export const APPLIANCES: { key: string; name: string; watts: number; said: RegExp }[] = [
  { key: 'fridge', name: 'fridge', watts: 150, said: /fridge|refrigerator/i },
  { key: 'fan', name: 'ceiling fan', watts: 75, said: /\bfans?\b/i },
  { key: 'tv', name: 'TV', watts: 100, said: /\btv\b|television/i },
  { key: 'washer', name: 'washing machine', watts: 500, said: /wash/i },
  { key: 'mixer', name: 'mixer grinder', watts: 500, said: /mixer|grinder|mixie/i },
  { key: 'pump', name: 'water pump (1 HP)', watts: 750, said: /pump|motor/i },
  { key: 'iron', name: 'iron', watts: 1000, said: /\biron/i },
  { key: 'microwave', name: 'microwave', watts: 1200, said: /microwave|\boven/i },
  { key: 'ac', name: '1.5-ton AC', watts: 1500, said: /\ba\.?c\.?\b|air.?con/i },
  { key: 'induction', name: 'induction stove', watts: 1800, said: /induction|stove|cooktop/i },
  { key: 'geyser', name: 'geyser', watts: 2000, said: /geyser|water heater|heater/i },
];

/** What a home has running on an ordinary day, in the order it would be turned on: for "what does the sun cover right now". */
export const USUAL_LOAD: { key: string; count: number }[] = [
  { key: 'fridge', count: 1 },
  { key: 'fan', count: 3 },
  { key: 'tv', count: 1 },
  { key: 'washer', count: 1 },
  { key: 'pump', count: 1 },
  { key: 'ac', count: 1 },
  { key: 'geyser', count: 1 },
];

/** Sizes installers commonly sell for homes, in kW. */
export const STANDARD_SIZES_KW = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10] as const;

export const SQFT_PER_M2 = 10.7639;
export const SQM_PER_ACRE = 4046.86;

/** A solar farm on the ground, as opposed to a roof. Read on 20 Nov 2026. */
export const FARM = {
  /**
   * Acres of land a megawatt needs. A planning figure in the middle of the usual 4 to 5; a
   * state form for PM-KUSUM Component A on the ministry's own site asks for at least 4.
   */
  acresPerMw: 4.5,
  acresSource: 'https://pmkusum.mnre.gov.in/assets/pdf/Component%20A/Goa_Comp%20A.pdf',
  /** PM-KUSUM Component A is for plants of this size, on barren or uncultivable farm land. */
  kusumMw: { least: 0.5, most: 2 },
  kusumSource: 'https://pmkusum.mnre.gov.in/landing-faq.html',
  /** Where a spot's yield comes from: the World Bank's Global Solar Atlas, with data by Solargis. */
  yieldSource: 'https://globalsolaratlas.info',
  /** The scheme's guidelines prefer the plant within this many kilometres of a substation, to keep the line short. */
  substationWithinKm: 5,
  /** The electricity company signs to buy the power for this many years. */
  buysForYears: 25,
  rulesSource: 'https://www.mprenewable.nic.in/uploads/2024/MNRE%20Guideline%20PM%20KUSUM%20dated%2017.01.2024.pdf',
  /**
   * What the electricity company pays for each unit, in rupees. Each state's regulator sets its
   * own. Karnataka's is its benchmark for megawatt-scale solar for July 2025 to June 2026.
   * Where a state's own figure was not found, the range other states have set is used, and
   * the person is told it is a range: Gujarat 2.95, Rajasthan 3.04, Karnataka 3.07.
   */
  paidPerUnit: {
    Karnataka: { rupees: 3.07, what: "Karnataka's benchmark for megawatt-scale solar, July 2025 to June 2026" },
    elsewhere: { low: 2.9, high: 3.1, what: 'what regulators in other states have set; this state\'s own figure was not found' },
  },
  paidSource: 'https://mercomindia.com/karnataka-sets-benchmark-tariff-of-%E2%82%B93-07-kwh-for-mw-scale-solar-projects',
  /** What a ground plant costs to build, in crore rupees a megawatt, land not counted. Industry estimates for 2026, not a regulator's figure. */
  costCrorePerMw: { low: 3.5, high: 4.5 },
  costSource: 'https://solarquarter.com/2026/10/23/solar-power-plant-cost-in-india-investment-land-requirement-roi/',
} as const;

export type Lang = 'en' | 'hi' | 'kn' | 'ta' | 'te' | 'ml';

export const LANGS: Record<
  Lang,
  {
    label: string;
    native: string;
    /** The conversation language given to Agora. It must be one Agora lists, and it is what Agora's own recogniser listens in. */
    asr: string;
    murfLocale: string;
    /**
     * Set when Agora's own recogniser has no such language. Dhoop then listens through
     * Deepgram (run by Agora, no key needed) in this language, and `asr` is only a stand-in.
     */
    deepgram?: string;
  }
> = {
  en: { label: 'English', native: 'English', asr: 'en-IN', murfLocale: 'en-IN' },
  hi: { label: 'Hindi', native: 'हिन्दी', asr: 'hi-IN', murfLocale: 'hi-IN' },
  kn: { label: 'Kannada', native: 'ಕನ್ನಡ', asr: 'kn-IN', murfLocale: 'kn-IN' },
  ta: { label: 'Tamil', native: 'தமிழ்', asr: 'ta-IN', murfLocale: 'ta-IN' },
  te: { label: 'Telugu', native: 'తెలుగు', asr: 'te-IN', murfLocale: 'te-IN' },
  // Agora lists Kannada, Tamil and Telugu but not Malayalam (checked 19 Nov 2026).
  ml: { label: 'Malayalam', native: 'മലയാളം', asr: 'en-IN', murfLocale: 'ml-IN', deepgram: 'ml' },
};

/** The order the languages are offered in on screen. */
export const LANG_ORDER: Lang[] = ['en', 'hi', 'kn', 'ta', 'te', 'ml'];

export function isLang(v: unknown): v is Lang {
  return typeof v === 'string' && Object.hasOwn(LANGS, v);
}
