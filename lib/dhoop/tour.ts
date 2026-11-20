/**
 * The tour: Dhoop at work with no microphone, for someone who has a minute and a link.
 *
 * At this hackathon the first round is judged from the submission, by mentors who open many
 * links over a lunch break in a loud hall. A voice app's front door is a microphone prompt,
 * which is the last thing such a visitor wants. The tour is a second door: ten things a
 * household would say, each answered by the same tool the voice agent calls, run for real on
 * this server, with the big screen filling in as it goes. Nothing in it is recorded or faked,
 * and it says so. It ends on the solar story, so the visitor hears the Murf Falcon voice too.
 *
 * The steps are fixed here, on the server. A visitor chooses only which step is next, so the
 * door cannot be used to run tools with arguments of the visitor's own.
 *
 * Safe to import from a screen: plain words. The running of a step is in the route.
 */

type Result = Record<string, unknown>;

export interface TourStep {
  /** What the household says, as the caption shows it. */
  says: string;
  tool: string;
  args: Record<string, unknown>;
  /** What Dhoop did, in a line, from the tool's own answer. */
  did: (r: Result) => string;
  /** How long the screen is given before the next step, in seconds. The first is a dive from orbit, and the last is a film. */
  hold: number;
}

const n = (v: unknown) => Number(v ?? 0).toLocaleString('en-IN');

export const TOUR: TourStep[] = [
  {
    says: 'Show me the Polaris School of Technology, where this hackathon is being held.',
    tool: 'findBuilding',
    args: { place: 'Polaris School of Technology' },
    did: (r) => `Found from satellite outlines: ${r.place}. Its largest roof has room for ${n(r.panels_that_fit)} panels, about ${n(Math.round(Number(r.largest_system_kw)))} kW.`,
    hold: 11,
  },
  {
    // The home is placed by its town, so that the rest of the tour is about a home and not about the tech park.
    says: 'Now my own home. I live in Bengaluru.',
    tool: 'setLocation',
    args: { place: 'Bengaluru' },
    did: (r) => `Sunshine for ${r.place} looked up from NASA: about ${r.peak_sun_hours_per_day} sun hours a day.`,
    hold: 4,
  },
  {
    says: 'My electricity bill is 3,200 rupees a month, for 310 units.',
    tool: 'saveBill',
    args: { monthly_units: 310, bill_amount: 3200 },
    did: () => 'Bill saved: 310 units a month, which works out to ₹10.32 a unit.',
    hold: 4,
  },
  {
    says: 'My roof is about 650 square feet, and a fifth of it is in shade.',
    tool: 'setRoofManual',
    args: { area_sqft: 650, shade_percent: 20 },
    did: (r) => `Roof noted: room for ${n(r.panels_that_fit ?? r.panels)} panels after shade and walkways.`,
    hold: 4,
  },
  {
    says: 'What should I install?',
    tool: 'designSolar',
    args: { target_kw: 0 },
    did: (r) => `A ${r.system_kw} kW system: saves ₹${n(r.saving_per_month_rupees)} a month, ₹${n(r.government_subsidy_rupees)} subsidy, pays back in ${r.pays_back_in_years} years.`,
    hold: 6,
  },
  {
    says: 'Is it worth it in the long run?',
    tool: 'longRunSavings',
    args: { price_rise_percent: 0 },
    did: (r) => `Over 25 years it saves ${r.saved_over_25_years_in_words}, with the panels' slow fade counted.`,
    hold: 6,
  },
  {
    says: 'What will it make this week?',
    tool: 'sunForecast',
    args: { about: 'the week' },
    did: (r) => `From the live weather forecast. Tomorrow: ${String(r.tomorrow ?? '').replace(/^[^:]*: /, '')}.`,
    hold: 6,
  },
  {
    says: 'Who installs solar here?',
    tool: 'findVendors',
    args: { place: 'here' },
    did: (r) => {
      const names = (Array.isArray(r.vendors) ? (r.vendors as string[]) : []).slice(0, 2).map((v) => v.split(':')[0]);
      return names.length ? `Registered vendors from the national portal, with phone numbers: ${names.join(' and ')}, and three more.` : 'Registered vendors from the national portal, with phone numbers.';
    },
    hold: 6,
  },
  {
    says: 'Can I get the subsidy? It is my own home, and the connection and the bank account are in my name.',
    tool: 'checkEligibility',
    args: { is_a_home: 'yes', connection_in_own_name: 'yes', bank_account_same_name: 'yes', roof_is_theirs_to_use: 'yes' },
    did: (r) => String(r.verdict ?? 'Checked the four things that decide it.'),
    hold: 5,
  },
  {
    says: 'Play my solar story.',
    tool: 'playSolarStory',
    args: { reason: 'tour' },
    did: () => 'The plan as a half-minute film, told in the Murf Falcon voice.',
    hold: 0,
  },
];

/** The steps as a visitor's screen needs them: the words, and how long each is held. Nothing a visitor could change. */
export const TOUR_SCRIPT = TOUR.map((s) => ({ says: s.says, hold: s.hold }));

/** A tour's session is told from a caller's by its name, which is all a visitor may choose. */
export const isTourSession = (sid: string): boolean => /^tour-[a-z0-9]{6,12}$/.test(sid);
