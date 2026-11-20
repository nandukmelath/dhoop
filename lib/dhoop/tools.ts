import { ASSUMPTIONS, LANG_ORDER, LANGS, LOAN, LONG_RUN, SQFT_PER_M2, SUBSIDY, type Lang } from './config';
import { findNamedRoof, findRoofAt } from './findroof';
import { inLakh, longRun } from './longrun';
import { sunWeek } from './outlook';
import { roofNow } from './today';
import { voiceNote } from './passbook';
import { geocode, sunshine } from './places';
import { SIDES, type Side } from './reshape';
import { changeRoof, moveRoof, nextBuilding, undoRoof } from './roofedit';
import { comparePlaces, findSite, findVendors, siteDetails } from './site';
import { showStreet } from './street';
import { warmStory } from './voice';
import { designSystem, inr, monthlyInstalment, roofCapacity, tariffFromBill, throughTheYear, type Design } from './solar';
import { ELIGIBILITY_CHECKS, eligibilityVerdict, FRAUD_WARNING, HELPLINE, KEEP_READY, SUBSIDY_STEPS, type Answer, type Eligibility } from './steps';
import { ensureSession, getSession, newId, updateSession, type Session } from './store';

/**
 * The agent's tools. Each one is a small HTTP endpoint that Agora calls while the
 * conversation is running (see app/api/tools/[name]/route.ts). Every tool writes to the
 * session, so the big screen updates the moment the agent acts.
 */

type Args = Record<string, unknown>;
type Result = Record<string, unknown>;

export interface ToolDef {
  name: string;
  description: string;
  /** JSON Schema properties for the arguments. All arguments are required, to keep calls predictable. */
  properties: Record<string, { type: 'string' | 'number'; description: string; enum?: string[] }>;
  run: (sid: string, args: Args) => Promise<Result> | Result;
}

const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : fallback;
};
const str = (v: unknown): string => (v === undefined || v === null ? '' : String(v)).trim();

/** The numbers worth saying aloud, in a shape the model can read off without doing maths. */
function speakable(d: Design): Result {
  return {
    system_kw: d.kw,
    panels: d.panels,
    units_made_per_month: d.monthlyGeneration,
    share_of_use_covered_percent: Math.round(d.coverage * 100),
    bill_now_rupees: d.billBefore,
    bill_after_rupees: d.billAfter,
    saving_per_month_rupees: d.monthlySavings,
    price_before_subsidy_rupees: d.grossCost,
    government_subsidy_rupees: d.subsidy,
    price_after_subsidy_rupees: d.netCost,
    pays_back_in_years: d.paybackYears,
    limited_by_roof: d.limitedByRoof,
    estimates_note: 'These are estimates. The price is an assumption until an installer quotes.',
  };
}

/** Price per kW implied by the lowest quote, once installers have replied. */
function quotedRate(s: Session): number | undefined {
  if (!s.quotes.length || !s.survey?.kw) return undefined;
  return Math.min(...s.quotes.map((q) => q.price)) / s.survey.kw;
}

function makeDesign(s: Session, targetKw?: number): Design {
  return designSystem({
    monthlyUnits: s.bill?.monthlyUnits ?? 0,
    billAmount: s.bill?.amount,
    sunHours: s.location?.sunHours,
    roofCapacityKw: s.roof?.capacityKw,
    targetKw,
    costPerKw: quotedRate(s),
  });
}

/** After a quote arrives, redo the design at the same size with the real price. */
export function redesignWithQuotes(sid: string) {
  const s = getSession(sid);
  if (!s?.design || !s.bill) return;
  const d = makeDesign(s, s.design.kw);
  updateSession(sid, (x) => {
    x.design = d;
  });
}

/**
 * When the roof under a design changes, the system is sized again for the new roof: a size the
 * roof was holding back grows into the new room, and a size the bill asked for stays as it was.
 * Returns what the agent should know and say next.
 */
function afterRoofChange(sid: string): Result {
  const s = getSession(sid);
  if (!s) return {};
  const said = 'In one or two short sentences, say what you did and how many panels fit now.';
  const was = s.design;
  if (!was || !s.bill) {
    // Without a bill the agent asked for it after every single change, which nags. The person is busy with the roof.
    return { next: s.bill ? `${said} Then call designSolar with target_kw 0.` : `${said} End your reply there: do not ask for the electricity bill, or anything else, in this reply.` };
  }
  const d = makeDesign(s, was.limitedByRoof ? undefined : was.kw);
  updateSession(sid, (x) => {
    x.design = d;
    x.compare = undefined;
  });
  const changed = d.kw !== was.kw;
  return {
    system_worked_out_again: speakable(d),
    system_size_changed: changed,
    next: changed
      ? `${said} The system was worked out again for this roof and its size has changed: say its new size and the monthly saving too.`
      : `${said} The recommended system is the same size as before, because the bill decides it and not the roof. Say that only if they asked for more panels, and then offer to try a bigger size with designSolar.`,
  };
}

const sideSaid = (v: unknown): Side | undefined => {
  const side = str(v).toLowerCase();
  return (SIDES as readonly string[]).includes(side) ? (side as Side) : undefined;
};
const SIDE_HELP = 'as the person sees the picture, which has north at the top: right, left, top (also up, above, behind, the back, north) or bottom (also down, below, the front, towards them, south)';

export { SUBSIDY_STEPS };

const answer = (v: unknown): Answer => {
  const a = str(v).toLowerCase();
  return a === 'yes' || a === 'no' ? a : 'unknown';
};
const YES_NO = { type: 'string' as const, enum: ['yes', 'no', 'unknown'] };

/** Where a household is on the way to the subsidy, in a shape the model can read out. */
function whereTheyStand(s: Session): Result {
  const done = Math.min(Math.max(s.application?.stagesDone ?? 0, 0), SUBSIDY_STEPS.length);
  const next = SUBSIDY_STEPS[done];
  return {
    stages_in_all: SUBSIDY_STEPS.length,
    stages_done: done,
    next_stage: next ? { number: done + 1, name: next.title, what_happens: next.detail, who_acts: next.who } : 'All ten stages are done. The subsidy has been paid.',
  };
}

/** The six languages by the names people call them, in English and in their own letters. */
const LANGUAGE_SAID: [RegExp, Lang][] = [
  [/english|angrezi|inglish|अंग्रेज़ी|अंग्रेजी|ಇಂಗ್ಲಿಷ್|ஆங்கிலம்|ఇంగ్లీష్|ഇംഗ്ലീഷ്/i, 'en'],
  [/hindi|हिन्दी|हिंदी|ಹಿಂದಿ|இந்தி|హిందీ|ഹിന്ദി/i, 'hi'],
  [/kannada|canarese|ಕನ್ನಡ|कन्नड़|கன்னடம்|కన్నడ|കന്നഡ/i, 'kn'],
  [/tamil|தமிழ்|तमिल|ತಮಿಳು|తమిళం|തമിഴ്/i, 'ta'],
  [/telugu|తెలుగు|तेलुगु|तेलुगू|ತೆಲುಗು|தெலுங்கு|തെലുങ്ക്/i, 'te'],
  [/malayalam|മലയാളം|मलयालम|ಮಲಯಾಳಂ|மலையாளம்|మలయాళం/i, 'ml'],
];

/** Which of the six languages was asked for, from its name in any of them or its two-letter code. */
export function languageSaid(said: string): Lang | undefined {
  const plain = said.trim().toLowerCase();
  if ((LANG_ORDER as readonly string[]).includes(plain)) return plain as Lang;
  return LANGUAGE_SAID.find(([name]) => name.test(said))?.[1];
}

/**
 * "Carry on in Kannada", asked aloud. An agent listens and speaks in one language for its
 * whole life, so this one cannot simply start speaking another: it leaves a note in the
 * session, the call screen sees it and brings a new agent in that language, with the
 * conversation so far in its instructions.
 */
function askLanguage(sid: string, said: string): Result {
  const s = ensureSession(sid);
  const to = languageSaid(said);
  if (!to) return { ok: false, error: `"${said}" is not one of the languages Dhoop speaks.`, speaks: LANG_ORDER.map((l) => LANGS[l].label), next: 'Say which languages you speak, and ask which they would like.' };
  if (to === s.lang) return { ok: true, already_speaking: LANGS[to].label, next: 'You are already speaking it. Say so in a few words and carry on.' };
  updateSession(
    sid,
    (x) => {
      x.langAsk = { to, key: `${to}:${Date.now().toString(36)}`, at: Date.now() };
    },
    { kind: 'changeLanguage', text: `Asked to carry on in ${LANGS[to].label}` },
  );
  return { ok: true, switching_to: LANGS[to].label, next: `Say only "One moment." and then nothing more. Do NOT speak ${LANGS[to].label} yourself: in a few seconds you are brought back speaking it, with everything remembered.` };
}

/**
 * A system worked out on the spot, when the bill is known and nobody has asked for one yet.
 * The long view and the week's forecast are about a system. Asked before one existed, they
 * answered "design it first"; in a real call the model then designed it, read the design out,
 * and never came back to the question. So they design it themselves and say that they did.
 */
function designIfBill(sid: string): { design?: Design; justNow: boolean } {
  const s = ensureSession(sid);
  if (s.design || !s.bill) return { design: s.design, justNow: false };
  const d = makeDesign(s);
  updateSession(
    sid,
    (x) => {
      x.design = d;
      x.compare = undefined;
      x.view = 'design';
    },
    { kind: 'designSolar', text: `Designed ${d.kw} kW to answer the question: saves ${inr(d.monthlySavings)} a month, pays back in ${d.paybackYears} years` },
  );
  return { design: d, justNow: true };
}

/** The 25-year view of the system on the screen, at today's price of electricity or with the yearly rise the person named. */
function longRunFor(sid: string, risePercent: number): Result {
  const { design: d, justNow } = designIfBill(sid);
  if (!d) return { ok: false, error: 'No bill is saved yet, so no system can be worked out.', next: 'Ask for the monthly bill or units, call saveBill, then call longRunSavings again.' };
  const run = longRun(d.netCost, d.monthlySavings, risePercent);
  updateSession(
    sid,
    (x) => {
      x.longRun = { key: `${run.priceRisePercent}:${Date.now().toString(36)}`, priceRisePercent: run.priceRisePercent };
    },
    { kind: 'longRunSavings', text: `Worked out ${LONG_RUN.years} years of the ${d.kw} kW system${run.priceRisePercent ? `, electricity ${run.priceRisePercent}% dearer a year` : ''}` },
  );
  const asked = Number.isFinite(risePercent) && risePercent > LONG_RUN.mostPriceRisePercent;
  return {
    ok: true,
    ...(justNow ? { worked_out_just_now: `No system had been designed, so a ${d.kw} kW one was worked out from the bill for this. Say its size in a few words first.` } : {}),
    system_kw: d.kw,
    you_pay_after_subsidy: d.netCost,
    pays_for_itself_in_years: run.paysBackIn ?? `not within ${LONG_RUN.years} years`,
    saved_over_25_years_in_words: `about ${inLakh(run.savedInAll)} rupees`,
    ahead_after_25_years_in_words: `about ${inLakh(run.aheadAtEnd)} rupees, the cost taken off`,
    years_of_electricity_after_it_has_paid_for_itself: run.freeYears,
    price_of_electricity: run.priceRisePercent
      ? `${run.priceRisePercent}% dearer each year, the person's own "what if"${asked ? ` (they asked for more; ${LONG_RUN.mostPriceRisePercent}% is the most this sum takes)` : ''}. It is NOT a forecast.`
      : "Kept at today's price for all 25 years. If prices rise, it saves more.",
    counted: `The panels' slow fade: ${LONG_RUN.fadePercentAYear}% less each year, the usual warranty's floor.`,
    left_out: 'Cleaning, a new inverter after ten years or so, and the interest on a loan. So the true figure is somewhat lower.',
    next: 'Say in two short sentences when it has paid for itself and what it saves over the 25 years, and in a few words what price of electricity that assumes. Then one short sentence on what is left out. The chart is on the screen.',
  };
}

export const TOOLS: ToolDef[] = [
  {
    name: 'saveBill',
    description:
      'Save the household electricity bill once you know it, either read from the camera or told to you. Call this before designing anything. Use 0 for a value you do not know.',
    properties: {
      monthly_units: { type: 'number', description: 'Units (kWh) used in a month, as printed on the bill. 0 if unknown.' },
      bill_amount: { type: 'number', description: 'Bill amount for the month in rupees. 0 if unknown.' },
      source: { type: 'string', description: 'How you learned it.', enum: ['camera', 'spoken'] },
    },
    run: (sid, a) => {
      let units = num(a.monthly_units);
      const amount = num(a.bill_amount);
      if (units <= 0 && amount <= 0) return { ok: false, error: 'Need the units used or the bill amount. Ask the person.' };
      let estimated = false;
      if (units <= 0) {
        units = Math.round(amount / ASSUMPTIONS.defaultTariff);
        estimated = true;
      }
      const tariff = tariffFromBill(units, amount);
      const source = str(a.source) === 'camera' ? 'camera' : 'spoken';
      updateSession(
        sid,
        (s) => {
          s.bill = { monthlyUnits: units, amount: amount > 0 ? amount : Math.round(units * tariff), tariff, source };
          s.view = 'bill';
        },
        { kind: 'saveBill', text: `Bill saved: ${units} units a month${amount > 0 ? `, ${inr(amount)}` : ''} (${source})` },
      );
      return { ok: true, monthly_units: units, units_were_estimated_from_amount: estimated, rupees_per_unit: tariff, next: 'Now find the home yourself: call findMyRoof. Only if it says the location is not shared, ask which city or town the home is in and call setLocation.' };
    },
  },
  {
    name: 'setLocation',
    description: 'Set where the home is, to look up how much sunshine it gets from NASA data. Call once you know the city, town or area.',
    properties: { place: { type: 'string', description: 'City, town or area in India, in English letters and by the name it is known by in English, for example "Tumakuru", "Whitefield Bengaluru", or "Coimbatore" when the person says Kovai or Koyambuthur.' } },
    run: async (sid, a) => {
      const place = str(a.place);
      if (!place) return { ok: false, error: 'No place given.' };
      const found = await geocode(place);
      if (!found) return { ok: false, error: `Could not find "${place}". Ask for the nearest city.` };
      const sun = await sunshine(found.lat, found.lon);
      updateSession(
        sid,
        (s) => {
          s.location = { label: found.label, lat: found.lat, lon: found.lon, sunHours: sun.annual, monthly: sun.monthly, source: sun.source };
          // The person named the place, so the device's location no longer moves the home.
          s.followDevice = false;
        },
        { kind: 'setLocation', text: `Sunshine at ${found.label}: ${sun.annual} peak hours a day (${sun.source === 'nasa' ? 'NASA data' : 'national average'})` },
      );
      return { ok: true, place: found.label, peak_sun_hours_per_day: sun.annual, data_source: sun.source === 'nasa' ? 'NASA POWER long-term average' : 'national average, NASA lookup failed', next: 'Ask the person to tap their building on the satellite view on screen, or to show the roof to the camera, then call getRoofSurvey.' };
    },
  },
  {
    name: 'findMyRoof',
    description:
      "Find where the person is right now from this device's live location, pick out their building and measure its roof on satellite data, without asking them to draw anything. It also learns the place and its sunshine. Call it as soon as you need to know where the home is or how big the roof is, before asking for the city. Call it again whenever the person asks where they are, asks you to find their house, building or roof, or says they have moved. Do not ask for permission first: just call it. If it says the location is not shared, ask for the city instead.",
    properties: { reason: { type: 'string', description: 'Why you are looking, in a few words.' } },
    run: async (sid) => {
      const s = ensureSession(sid);
      if (!s.device) {
        return {
          ok: false,
          location_shared: false,
          next: 'This device has not shared its location. Ask which city or town the home is in and call setLocation, and tell the person they can also press "Find my building" on the screen.',
        };
      }
      const { lat, lon, accuracyM } = s.device;
      const result = await findRoofAt(sid, { lat, lon, accuracyM }, 'device');
      updateSession(sid, (x) => {
        if (x.device) x.device.used = { lat, lon };
      });
      return result;
    },
  },
  {
    name: 'findBuilding',
    description:
      'Find a building the person names, anywhere in India, fly the screen to it and measure its roof on satellite data: an office, a school, a temple, a mall, a hospital, an apartment block or a famous landmark. Call it whenever the person names a building or a landmark and wants to see it, or wants to know what solar it could hold. It is only for a place the person names: to find where the person is right now call findMyRoof, and for a town or an area with no building named call setLocation.',
    properties: {
      place: {
        type: 'string',
        description:
          'The name of the building or landmark as it is usually written in English letters, then its area and its city when you know them. For example "Vidhana Soudha, Bengaluru" or "Lulu Mall, Kochi". Put right the spelling of well-known names.',
      },
    },
    run: (sid, a) => {
      const place = str(a.place);
      if (!place) return { ok: false, error: 'No building named. Ask which building.' };
      return findNamedRoof(sid, place);
    },
  },
  {
    name: 'getRoofSurvey',
    description:
      'Read what the camera survey or the satellite view measured about the roof: area, shade and how many panels fit. Call it after the person has shown the roof, and again whenever they say the shade or the sun has changed.',
    properties: { reason: { type: 'string', description: 'Why you are checking, in a few words.' } },
    run: (sid) => {
      const s = ensureSession(sid);
      if (!s.roof) {
        updateSession(sid, (x) => {
          x.view = 'roof';
        });
        return { ok: false, measured: false, next: 'No roof measured yet. Ask the person to tap their building on the satellite view on screen, or to point the camera at the roof. If they cannot, ask for the roof size in square feet and call setRoofManual.' };
      }
      const r = s.roof;
      updateSession(sid, (x) => {
        x.view = 'roof';
      }, { kind: 'getRoofSurvey', text: `Roof read: ${Math.round(r.areaM2 * SQFT_PER_M2)} sq ft, ${Math.round(r.shadeFraction * 100)}% shaded, room for ${r.panelsFit} panels` });
      return {
        ok: true,
        measured: true,
        measured_by: r.source,
        roof_area_sqft: Math.round(r.areaM2 * SQFT_PER_M2),
        shaded_percent: Math.round(r.shadeFraction * 100),
        usable_area_sqft: Math.round(r.usableM2 * SQFT_PER_M2),
        panels_that_fit: r.panelsFit,
        largest_system_kw: r.capacityKw,
        caution: r.source === 'model' ? 'Measured on a table-top model, so treat it as a demonstration.' : 'A pre-survey estimate. An installer confirms it on site.',
        next: 'Call designSolar with target_kw 0 to recommend a size.',
      };
    },
  },
  {
    name: 'setRoofManual',
    description: 'Record the roof from what the person tells you, when the camera or satellite view cannot be used.',
    properties: {
      area_sqft: { type: 'number', description: 'Open terrace or roof area in square feet.' },
      shade_percent: { type: 'number', description: 'Roughly how much of it is in shade during the day, 0 to 90.' },
    },
    run: (sid, a) => {
      const areaM2 = num(a.area_sqft) / SQFT_PER_M2;
      if (areaM2 <= 2) return { ok: false, error: 'Roof area looks too small. Ask again in square feet.' };
      const shade = Math.min(Math.max(num(a.shade_percent), 0), 90) / 100;
      const cap = roofCapacity(areaM2, shade);
      updateSession(
        sid,
        (s) => {
          s.roof = { areaM2, shadeFraction: shade, usableM2: cap.usableM2, capacityKw: cap.kw, panelsFit: cap.panels, source: 'spoken' };
          s.followDevice = false;
          s.view = 'roof';
        },
        { kind: 'setRoofManual', text: `Roof noted: ${Math.round(num(a.area_sqft))} sq ft, ${Math.round(shade * 100)}% shaded` },
      );
      return { ok: true, panels_that_fit: cap.panels, largest_system_kw: cap.kw, next: 'Call designSolar with target_kw 0.' };
    },
  },
  {
    name: 'changeRoof',
    description:
      'Redraw the roof outlined on the screen by what the person says, and fit the panels again. Make it bigger when they say the real roof goes further ("add 300 square metres on the right", "extend it at the front by 500 square feet and put panels there too"). Make it smaller when a part is not theirs or cannot hold panels ("leave out 100 square feet on the left for the water tank", "only the left half is mine"). Call it at once whenever they ask for this; never ask them to draw it instead.',
    properties: {
      change: { type: 'string', enum: ['add', 'remove'], description: 'add makes the roof bigger; remove leaves a part out.' },
      side: {
        type: 'string',
        enum: ['left', 'right', 'top', 'bottom', 'all_round'],
        description: `The side of the roof that moves, ${SIDE_HELP}. For remove it is the side the part is taken from: "only the left half is mine" removes 50 percent from the right. Use all_round when they name no side.`,
      },
      amount: { type: 'number', description: 'How much, as the person said it: the number alone. For "half" use 50 and for "a quarter" use 25, with the unit percent.' },
      unit: { type: 'string', enum: ['square_metres', 'square_feet', 'percent'], description: 'The unit the person used. Never convert it yourself. percent means a share of the roof as it is now.' },
    },
    run: (sid, a) => {
      const unit = str(a.unit).toLowerCase();
      const result = changeRoof(sid, {
        change: str(a.change).toLowerCase().startsWith('rem') ? 'remove' : 'add',
        side: sideSaid(a.side) ?? 'all_round',
        amount: num(a.amount),
        unit: /f(ee|oo)?t/.test(unit) ? 'square_feet' : unit.includes('percent') || unit.includes('%') ? 'percent' : 'square_metres',
      });
      return result.ok ? { ...result, ...afterRoofChange(sid) } : result;
    },
  },
  {
    name: 'moveRoof',
    description:
      'Slide the outline on the screen over a little, without changing its size, when the person says it does not sit on their roof in the picture: "the outline is a bit off, move it 4 metres up", "shift it to the left a little". The building data and the satellite picture can be a few metres apart. For a different building use nextBuilding instead.',
    properties: {
      direction: { type: 'string', enum: ['left', 'right', 'top', 'bottom'], description: `Which way to move it, ${SIDE_HELP}.` },
      distance: { type: 'number', description: 'How far, as the person said it: the number alone. Use 3 when they say only "a little" or "a bit".' },
      unit: { type: 'string', enum: ['metres', 'feet'], description: 'The unit the person used. Use metres when they gave none.' },
    },
    run: (sid, a) => {
      const side = sideSaid(a.direction);
      if (!side) return { ok: false, error: 'Need which way: left, right, top or bottom of the picture.', next: 'Ask the person which way to move it.' };
      const metres = /f(ee|oo)?t/.test(str(a.unit).toLowerCase()) ? num(a.distance) * 0.3048 : num(a.distance);
      const result = moveRoof(sid, side, metres);
      return result.ok ? { ...result, next: 'Say in one short sentence that you moved the outline and which way, and ask if it sits on the roof now. Nothing else changed.' } : result;
    },
  },
  {
    name: 'nextBuilding',
    description:
      'Move the outline to the neighbouring building, when the person says the building outlined is not the one and says which way theirs lies: "not this one, the next building to the right", "the one behind it". The screen moves there and that roof is measured. If they do not say which way, ask them, or ask them to tap it.',
    properties: { direction: { type: 'string', enum: ['left', 'right', 'top', 'bottom'], description: `Which way from the building now outlined, ${SIDE_HELP}.` } },
    run: async (sid, a) => {
      const side = sideSaid(a.direction);
      if (!side) return { ok: false, error: 'Need which way: left, right, top or bottom of the picture.', next: 'Ask the person which way their building lies from the one outlined.' };
      const result = await nextBuilding(sid, side);
      return result.ok
        ? { ...result, ...afterRoofChange(sid), then: 'Give the roof size as well, and ask whether this is the right building. If it is not, they can say which way to move again, or tap the building on the screen.' }
        : result;
    },
  },
  {
    name: 'undoRoofChange',
    description: 'Put the roof back as it was before the last change made by changeRoof, moveRoof or nextBuilding. Call it when the person says undo, go back, or that the change was wrong. Calling it again goes back one change further.',
    properties: { reason: { type: 'string', description: 'Why, in a few words.' } },
    run: (sid) => {
      const result = undoRoof(sid);
      return result.ok ? { ...result, ...afterRoofChange(sid) } : result;
    },
  },
  {
    name: 'showNeighbourhood',
    description:
      'Show what solar the whole neighbourhood could hold: every roof around the home lights up on the satellite view and the screen adds them up. Call it when the person asks about their street, lane, colony, layout, apartment society, village or neighbourhood, or asks what would happen if everyone around them put up solar.',
    properties: {
      radius_metres: { type: 'number', description: 'How far round the home to look: about 100 for a street or a lane, 200 for a colony, a layout or a neighbourhood, 300 for a village or a larger area. Use 200 when they do not say.' },
    },
    run: (sid, a) => showStreet(sid, num(a.radius_metres)),
  },
  {
    name: 'findSolarSite',
    description:
      'Find the best place to build a solar farm or a large ground plant, and the reasons. It compares places across the area named for how much sun they get and how open the land is, sizes the land and the energy, and shows the best place on the screen with the land marked. Call it when the person wants to start a solar farm or a plant of a megawatt or so, asks where the best area or land for solar is, or asks for the sunniest place. It takes about eight seconds.',
    properties: {
      capacity_mw: { type: 'number', description: 'The size of the plant in megawatts: 1 for one megawatt, 0.5 for 500 kilowatts. Use 1 when they give no size.' },
      search_in: { type: 'string', description: 'Where to look, in English letters: a district, a state, or a town to look around, for example "Kasaragod district", "Karnataka" or "Tumakuru". Use "near home" when they name no area and the home is placed.' },
    },
    // Agora gives a tool fifteen seconds. If the data services are slow the search answers
    // before that, with a way forward; it carries on behind and is quick the second time.
    run: (sid, a) =>
      Promise.race([
        findSite(sid, num(a.capacity_mw), str(a.search_in)),
        new Promise<Result>((done) => setTimeout(() => done({ ok: false, error: 'The comparison is taking longer than usual.', next: 'Say it is taking a little longer than usual, and call findSolarSite again with the same size and area.' }), 12500)),
      ]),
  },
  {
    name: 'siteDetails',
    description:
      'Fetch the practical details for the place just recommended for a solar farm: the nearest electricity substations with their distance, voltage and who runs them; the registered solar vendors for that district with their phone numbers, ratings and installations; and the money, meaning what the electricity company pays for each unit, what the plant earns a year, what it costs to build and how long it takes to pay back. Call it whenever they ask about the substation, the grid, vendors, installers, agents, contacts or phone numbers, or the cost, income, profit or payback of a solar farm. Never ask the person for these and never say you cannot fetch them: call this.',
    properties: { about: { type: 'string', description: 'What they asked about, in a few words: the grid, vendors, money, or all.' } },
    run: (sid) => siteDetails(sid),
  },
  {
    name: 'findVendors',
    description:
      "Find the registered solar vendors for any place in India, with their phone numbers, consumers' ratings and installations, from the national rooftop solar portal's own list. Call it at once whenever the person asks who can install or build it, for vendors, installers, dealers or contractors, or for someone's number: for where they are, or for any town, district or state they name. It works for every state and union territory. It only looks up the list; sending the survey out for quotes is requestQuotes.",
    properties: { place: { type: 'string', description: 'The town, district or state they asked about, in English letters, for example "Jaipur" or "Idukki, Kerala". Write "here" when they mean where they are, or named no place.' } },
    run: (sid, a) => findVendors(sid, str(a.place)),
  },
  {
    name: 'comparePlaces',
    description:
      'Set two to four named places side by side for solar: how much the same panels make in each, which is best and why. Call it when the person asks which of some places is better or sunnier for solar, for example their own town against their parents\' town, or one city against another.',
    properties: { places: { type: 'string', description: 'The places in English letters, separated by semicolons, for example "Kochi; Palakkad" or "Jaipur; Chennai; Bengaluru".' } },
    run: (sid, a) => comparePlaces(sid, str(a.places)),
  },
  {
    name: 'playSolarStory',
    description:
      "Play the household's solar story over the whole screen: a short film of their own roof, the panels, the saving and the subsidy, told aloud in their language. Call it at once whenever they ask for their story, a summary or a recap, or for something to show the family or the room. Ask for nothing first: the tool knows what has been worked out, and says so if there is nothing to show yet.",
    properties: { reason: { type: 'string', description: 'Why, in a few words.' } },
    run: (sid) => {
      const s = ensureSession(sid);
      if (!voiceNote(s)) return { ok: false, error: 'There is no roof or system yet to tell a story about.', next: 'Find the roof or work out the system first, then offer the story.' };
      updateSession(
        sid,
        (x) => {
          x.story = { key: newId('story'), at: Date.now() };
        },
        { kind: 'playSolarStory', text: 'Playing the solar story' },
      );
      warmStory(sid, true);
      return { ok: true, playing: true, lasts_about_seconds: 30, next: 'Say only "Here is your solar story." and nothing more. The film has its own voice. Stay silent until the person speaks again.' };
    },
  },
  {
    name: 'designSolar',
    description:
      'Work out the solar system: size, panels, monthly saving, subsidy, price and payback. Always call this for numbers; never work them out yourself. Use target_kw 0 for the recommended size, or a number to try a specific size.',
    properties: { target_kw: { type: 'number', description: 'System size to try in kW, or 0 to let Dhoop recommend.' } },
    run: (sid, a) => {
      const s = ensureSession(sid);
      if (!s.bill) return { ok: false, error: 'No bill saved yet. Ask for the monthly units or bill amount and call saveBill first.' };
      const target = num(a.target_kw);
      const d = makeDesign(s, target > 0 ? target : undefined);
      updateSession(
        sid,
        (x) => {
          x.design = d;
          x.compare = undefined;
          x.view = 'design';
        },
        { kind: 'designSolar', text: `Designed ${d.kw} kW: saves ${inr(d.monthlySavings)} a month, subsidy ${inr(d.subsidy)}, pays back in ${d.paybackYears} years` },
      );
      const year = throughTheYear(d.kw, s.location?.monthly ?? [], s.bill.monthlyUnits);
      return {
        ok: true,
        ...speakable(d),
        // For "what about the monsoon?". The screen draws the twelve months under the system.
        ...(year
          ? {
              through_the_year: {
                best_month: `${year.best.name}, about ${year.best.made} units`,
                poorest_month: `${year.poorest.name}, about ${year.poorest.made} units`,
                months_that_make_less_than_the_home_uses: year.monthsShort,
                how_it_evens_out: 'What the sunny months make beyond the home\'s use is set against the lean months by net metering. The saving above already counts on that.',
              },
            }
          : {}),
        assumptions: d.notes,
        next: 'Say the size, the monthly saving, the subsidy and the payback in one or two sentences. Then offer to compare with another size or to explain the subsidy steps. If they ask about the monsoon, the rains or the seasons, answer from through_the_year.',
      };
    },
  },
  {
    name: 'compareSizes',
    description: 'Put two system sizes side by side on the screen and get both sets of numbers.',
    properties: {
      kw_a: { type: 'number', description: 'First size in kW.' },
      kw_b: { type: 'number', description: 'Second size in kW.' },
    },
    run: (sid, a) => {
      const s = ensureSession(sid);
      if (!s.bill) return { ok: false, error: 'No bill saved yet. Call saveBill first.' };
      const ka = num(a.kw_a);
      const kb = num(a.kw_b);
      if (ka <= 0 || kb <= 0) return { ok: false, error: 'Both sizes must be above zero.' };
      const da = makeDesign(s, ka);
      const dbb = makeDesign(s, kb);
      updateSession(
        sid,
        (x) => {
          x.compare = { a: da, b: dbb };
          x.view = 'compare';
        },
        { kind: 'compareSizes', text: `Compared ${da.kw} kW with ${dbb.kw} kW` },
      );
      return { ok: true, first: speakable(da), second: speakable(dbb), next: 'Say the one difference that matters most, in one sentence, and ask which they prefer.' };
    },
  },
  {
    name: 'longRunSavings',
    description:
      'Work out what the designed system saves over its 25 years: when it has paid for itself, the total saved and how far ahead the household is at the end, with a chart on the screen. Call it at once when the person asks whether it is worth it in the long run, what it saves over 10, 20 or 25 years, or "what if electricity gets dearer every year". Call it at once and never ask for anything first: it works the system out from the saved bill itself, and says so if no bill is saved.',
    properties: { price_rise_percent: { type: 'number', description: "The yearly rise in the price of electricity the person named, in percent, for example 5. Write 0 when they named none: the sum then keeps today's price." } },
    run: (sid, a) => longRunFor(sid, num(a.price_rise_percent)),
  },
  {
    name: 'sunForecast',
    description:
      "Fetch this week's weather forecast for the home and work out what its solar system would make on each of the next seven days, today first. Call it at once when the person asks what the panels will make today, tomorrow, at the weekend or this week, whether it will be sunny, or which day is best for the washing machine or the pump. Call it at once, whatever is or is not known so far: NEVER ask for the bill or the place first. It works the system out from a saved bill itself, and it says what is missing.",
    properties: { about: { type: 'string', description: 'Which day or days they asked about, in a few words: today, tomorrow, the weekend, the week.' } },
    run: (sid) => {
      // With a bill and no system yet, the system is worked out first, so the week is in the household's own units.
      designIfBill(sid);
      return sunWeek(sid);
    },
  },
  {
    name: 'powerNow',
    description:
      "Look up what the sun is doing at the home at this moment and work out what its solar system is making right now, which household things that covers, and how today goes hour by hour. Call it at once when the person asks what the roof or panels are making now, whether they can run an AC, geyser, pump or anything else on solar, or what the sun covers at this time of day. Call it at once, whatever is or is not known so far: NEVER ask for the bill, the place or a list of appliances first. It works the system out from a saved bill itself, and it says what is missing.",
    properties: { appliances: { type: 'string', description: 'The things they named, in English, separated by commas: "AC" when they said only the AC, "AC, geyser" when they said both. Write "none" when they named nothing. Take what they said as it is: NEVER ask which appliances they have before calling.' } },
    run: (sid, a) => {
      // With a bill and no system yet, the system is worked out first, so the answer is in the household's own kilowatts.
      designIfBill(sid);
      return roofNow(sid, str(a.appliances));
    },
  },
  {
    name: 'changeLanguage',
    description:
      'Carry on the conversation in another of the six languages: English, Hindi, Kannada, Tamil, Telugu or Malayalam. Call it at once when the person asks you to speak, explain or continue in one of them, or to explain it to someone who speaks one ("tell my mother in Kannada"). You cannot speak another language yourself: this brings you back speaking it, with everything remembered.',
    properties: { language: { type: 'string', description: 'The language asked for, by its English name: english, hindi, kannada, tamil, telugu or malayalam.' } },
    run: (sid, a) => askLanguage(sid, str(a.language)),
  },
  {
    name: 'subsidySteps',
    description:
      'Show where the person stands on the way to the government subsidy under PM Surya Ghar, tell you the next stage, and remember how far they have got. Call it when they ask about the subsidy or how to apply, and call it again every time they tell you a stage is finished: they have registered, applied, got the approval, chosen a vendor, had the system installed, inspected or commissioned, asked for the subsidy, or received it.',
    properties: {
      last_stage_done: {
        type: 'number',
        description:
          'The number of the last stage the person says they have finished: 1 registered on the portal, 2 application submitted, 3 feasibility approved, 4 vendor chosen, 5 installation started, 6 installation details entered, 7 inspected, 8 commissioned, 9 subsidy asked for, 10 subsidy received. Use 0 if they have not started, and -1 if they have not said: Dhoop then keeps what it remembers.',
      },
    },
    run: (sid, a) => {
      const said = Math.min(SUBSIDY_STEPS.length, Math.round(num(a.last_stage_done, -1)));
      const s = updateSession(
        sid,
        (x) => {
          x.stepsShown = true;
          x.view = 'steps';
          // A stage the person names is taken as said. "Not started" and "did not say" never wipe what is already remembered.
          if (said >= 1 || (said === 0 && !x.application)) x.application = { eligibility: x.application?.eligibility, stagesDone: said, updatedAt: Date.now() };
        },
        { kind: 'subsidySteps', text: said >= 1 ? `Application: stage ${said} of ${SUBSIDY_STEPS.length} done, ${SUBSIDY_STEPS[said - 1].title.toLowerCase()}` : 'Opened the subsidy application' },
      );
      return {
        ok: true,
        scheme: 'PM Surya Ghar: Muft Bijli Yojana',
        subsidy_rule: `Rs ${SUBSIDY.perKwFirstTwo} per kW for the first 2 kW, Rs ${SUBSIDY.perKwThird} for the third kW, at most Rs ${SUBSIDY.cap}.`,
        scheme_closes: SUBSIDY.schemeCloses,
        ...whereTheyStand(s),
        all_stages: SUBSIDY_STEPS.map((x, i) => `${i + 1}. ${x.title}`),
        eligibility_checked: !!s.application?.eligibility,
        keep_ready: KEEP_READY,
        helpline: `${HELPLINE}, toll free`,
        warning: FRAUD_WARNING,
        note: 'The person applies on the official portal themselves, or lets a registered vendor do it with their consent. Dhoop cannot submit it for them. Tell them to confirm each stage on pmsuryaghar.gov.in.',
        next: 'Say which stage they are at and explain only the next stage, in one or two sentences. Give the warning once. If eligibility is not checked yet, ask what is missing among its four questions and call checkEligibility. When they later say a stage is finished, call subsidySteps again with its number.',
      };
    },
  },
  {
    name: 'checkEligibility',
    description:
      'Check whether the household can get the subsidy, from four things you ask the person one at a time: is it a home and not a shop; is the electricity connection in their own name; is their bank account in exactly the same name as the electricity bill; is the roof theirs to use. Call it once you have asked, with "unknown" for anything they could not answer. It says what must be put right before they apply.',
    properties: {
      is_a_home: { ...YES_NO, description: 'It is a home, not a shop, an office or a factory.' },
      connection_in_own_name: { ...YES_NO, description: 'The electricity connection is in the name of the person applying.' },
      bank_account_same_name: { ...YES_NO, description: 'Their bank account is in exactly the same name as on the electricity bill.' },
      roof_is_theirs_to_use: { ...YES_NO, description: 'They own the roof, or have permission to use it.' },
    },
    run: (sid, a) => {
      const eligibility: Eligibility = { home: answer(a.is_a_home), name: answer(a.connection_in_own_name), bank: answer(a.bank_account_same_name), roof: answer(a.roof_is_theirs_to_use) };
      const { verdict, fixes, toCheck } = eligibilityVerdict(eligibility);
      updateSession(
        sid,
        (s) => {
          s.application = { stagesDone: s.application?.stagesDone ?? 0, eligibility, updatedAt: Date.now() };
          s.stepsShown = true;
          s.view = 'steps';
        },
        { kind: 'checkEligibility', text: verdict === 'ready' ? 'Eligibility checked: ready to apply' : verdict === 'fix' ? `Eligibility checked: ${fixes.length} thing${fixes.length > 1 ? 's' : ''} to put right first` : 'Eligibility checked: some answers still to find out' },
      );
      return {
        ok: true,
        verdict: verdict === 'ready' ? 'Ready to apply.' : verdict === 'fix' ? 'Something must be put right before applying.' : 'Looks fine so far, but some answers are still to be found out.',
        put_right_first: fixes,
        still_to_find_out: toCheck,
        confirmed: ELIGIBILITY_CHECKS.filter((c) => eligibility[c.key] === 'yes').map((c) => c.good),
        keep_ready: KEEP_READY,
        warning: FRAUD_WARNING,
        next:
          verdict === 'fix'
            ? 'Tell the person kindly what has to be put right first, one thing at a time, and how. Then offer to carry on with the rest.'
            : 'Tell the person the result in one sentence and what to keep ready. Then call subsidySteps and explain the first stage they have not done.',
      };
    },
  },
  {
    name: 'loanPlan',
    description:
      "Work out the monthly instalment on the scheme's own bank loan for the system just designed, and set it beside the monthly saving. Call it when the person says they cannot pay the whole price at once, or asks about a loan or an EMI. Call designSolar first.",
    properties: { years: { type: 'number', description: 'Years to repay over, from 1 to 10. Use 0 when the person has no preference: Dhoop then picks the shortest time in which the instalment is no more than the monthly saving.' } },
    run: (sid, a) => {
      const s = ensureSession(sid);
      const d = s.design;
      if (!d) return { ok: false, error: 'No system designed yet. Call designSolar first.' };
      const amount = Math.min(LOAN.maxAmount, Math.round(d.grossCost * (1 - LOAN.ownShare)));
      const asked = Math.round(num(a.years));
      // With no preference: the shortest loan that the saving on the bill pays for, or the longest allowed.
      let years = Math.min(LOAN.maxYears, Math.max(1, asked));
      if (asked <= 0) for (years = 1; years < LOAN.maxYears && monthlyInstalment(amount, LOAN.ratePercentAYear, years * 12) > d.monthlySavings; years++);
      const own = d.grossCost - amount;
      const instalment = Math.round(monthlyInstalment(amount, LOAN.ratePercentAYear, years * 12));
      // The subsidy arrives in the borrower's account after commissioning. Paid into the loan, it lowers what is left to repay.
      const instalmentAfterSubsidy = Math.round(monthlyInstalment(Math.max(amount - d.subsidy, 0), LOAN.ratePercentAYear, years * 12));
      updateSession(
        sid,
        (x) => {
          x.loan = { cost: d.grossCost, amount, own, years, instalment, instalmentAfterSubsidy, saving: d.monthlySavings };
          x.view = 'design';
        },
        { kind: 'loanPlan', text: `Loan worked out: ${inr(amount)} over ${years} years is ${inr(instalment)} a month, against ${inr(d.monthlySavings)} saved a month` },
      );
      return {
        ok: true,
        price_of_system_rupees: d.grossCost,
        you_pay_first_rupees: own,
        loan_rupees: amount,
        years,
        years_chosen_by: asked <= 0 ? 'Dhoop, as the shortest time in which the saving covers the instalment' : 'the person',
        instalment_per_month_rupees: instalment,
        saving_per_month_rupees: d.monthlySavings,
        instalment_minus_saving_rupees: instalment - d.monthlySavings,
        instalment_if_subsidy_is_paid_into_the_loan_rupees: instalmentAfterSubsidy,
        interest_percent_a_year: LOAN.ratePercentAYear,
        terms: `The scheme's standard loan from public sector banks, up to ${inr(LOAN.maxAmount)}: the rate is the Reserve Bank's repo rate plus half a percent and can change, no income proof is asked for, there is no processing fee and no charge for repaying early, and the first instalment falls due ${LOAN.monthsBeforeFirstInstalment} months after the money is paid out. The bank decides whether to lend.`,
        next: 'Tell the person the monthly instalment beside the monthly saving, and what it falls to if the subsidy is paid into the loan. Say the bank decides and the rate can change. Do not recommend a bank.',
      };
    },
  },
  {
    name: 'requestQuotes',
    description: 'Send the finished roof survey and design to installers so they can quote. Ask the person for their name and their clear yes before calling this.',
    properties: { homeowner_name: { type: 'string', description: 'First name of the person, to put on the survey.' } },
    run: (sid, a) => {
      const s = ensureSession(sid);
      if (!s.design) return { ok: false, error: 'No design yet. Call designSolar first.' };
      const id = newId('survey');
      updateSession(
        sid,
        (x) => {
          x.survey = { id, homeowner: str(a.homeowner_name) || 'Homeowner', sentAt: Date.now(), kw: s.design!.kw };
          x.view = 'quotes';
        },
        { kind: 'requestQuotes', text: 'Survey sent to installers' },
      );
      return { ok: true, survey_id: id, next: 'Tell the person the survey has gone out and that you will speak up when a quote arrives. Quotes can be read with getQuotes.' };
    },
  },
  {
    name: 'getQuotes',
    description: 'Read the quotes installers have sent back so far.',
    properties: { reason: { type: 'string', description: 'Why you are checking, in a few words.' } },
    run: (sid) => {
      const s = ensureSession(sid);
      if (!s.survey) return { ok: false, error: 'No survey has been sent. Call requestQuotes first.' };
      updateSession(sid, (x) => {
        x.quotes.forEach((q) => (q.announced = true));
        x.view = 'quotes';
      });
      const quotes = [...s.quotes].sort((p, q) => p.price - q.price);
      if (!quotes.length) return { ok: true, quotes: [], next: 'No quotes yet. Say so, and offer to explain the subsidy steps while waiting.' };
      return {
        ok: true,
        quotes: quotes.map((q) => ({ installer: q.installer, price_before_subsidy_rupees: q.price, price_after_subsidy_rupees: Math.max(q.price - (s.design?.subsidy ?? 0), 0), install_days: q.days, note: q.note ?? '' })),
        next: 'Say the lowest price and how many days, in one sentence. Ask whether to book a site visit with bookVisit.',
      };
    },
  },
  {
    name: 'bookVisit',
    description: 'Book a site visit with the installer the person chose. Only call after the person clearly says yes to the installer, day and time.',
    properties: {
      installer: { type: 'string', description: 'Name of the installer, exactly as in the quote.' },
      day: { type: 'string', description: 'Day of the visit, for example "Saturday" or "22 November".' },
      time: { type: 'string', description: 'Time of the visit, for example "10 am".' },
    },
    run: (sid, a) => {
      const installer = str(a.installer);
      const day = str(a.day);
      const time = str(a.time);
      if (!installer || !day || !time) return { ok: false, error: 'Need the installer, the day and the time.' };
      const id = newId('visit');
      updateSession(
        sid,
        (s) => {
          s.booking = { id, installer, day, time };
          s.view = 'booked';
        },
        { kind: 'bookVisit', text: `Site visit booked with ${installer}: ${day}, ${time}` },
      );
      return { ok: true, booking_id: id, next: 'Confirm the visit in one sentence and say a reminder will come the day before. Then ask if they want anything else.' };
    },
  },
];

/** The tools that bring the talk, and so the screen, back to the home's own roof. */
const ROOF_TOOLS = new Set(['findMyRoof', 'findBuilding', 'getRoofSurvey', 'setRoofManual', 'changeRoof', 'moveRoof', 'nextBuilding', 'undoRoofChange', 'showNeighbourhood', 'designSolar', 'compareSizes']);

/**
 * Called after a tool has run. Once a system is worked out, the solar story's narration is made
 * again whenever a tool has changed what it would say (the roof, the system, the application),
 * so that it starts at once when asked for. A clip already made is not asked for twice.
 */
export function afterTool(sid: string) {
  if (getSession(sid)?.design) warmStory(sid);
}

/** Called before a tool runs. The screen stays on a solar farm's site only until the roof is talked about again. */
export function beforeTool(sid: string, name: string) {
  if (ROOF_TOOLS.has(name) && getSession(sid)?.site) {
    updateSession(sid, (s) => {
      s.site = undefined;
    });
  }
}

export function findTool(name: string): ToolDef | undefined {
  return TOOLS.find((t) => t.name === name);
}

/** Tool declarations in the shape Agora's Conversational AI Engine expects for REST tools. */
export function agoraTools(baseUrl: string, sid: string, secret: string) {
  const base = baseUrl.replace(/\/+$/, '');
  return TOOLS.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: { type: 'object' as const, properties: t.properties as Record<string, unknown>, required: Object.keys(t.properties) },
    },
    execution: { mode: 'sync' as const },
    server: {
      method: 'POST' as const,
      url: `${base}/api/tools/${t.name}?sid=${encodeURIComponent(sid)}`,
      headers: { 'x-dhoop-key': secret },
      body: Object.fromEntries(Object.keys(t.properties).map((k) => [k, `{{args.${k}}}`])),
      timeout_ms: 15000,
    },
  }));
}

/** One short line describing the whole session, used to brief a human or to restart the agent in another language. */
export function sessionBrief(id: string): string {
  const s = getSession(id);
  if (!s) return 'New conversation. Nothing is known yet.';
  const parts: string[] = [];
  if (s.bill) parts.push(`Bill: ${s.bill.monthlyUnits} units a month, about ${inr(s.bill.amount)}.`);
  if (s.location) parts.push(`Home: ${s.location.label}, ${s.location.sunHours} peak sun hours a day.`);
  if (s.roof) parts.push(`Roof: ${Math.round(s.roof.areaM2 * SQFT_PER_M2)} sq ft, ${Math.round(s.roof.shadeFraction * 100)}% shaded, room for ${s.roof.panelsFit} panels (measured by ${s.roof.source}).`);
  if (s.design) parts.push(`Design: ${s.design.kw} kW, saves ${inr(s.design.monthlySavings)} a month, subsidy ${inr(s.design.subsidy)}, pays back in ${s.design.paybackYears} years.`);
  if (s.survey) parts.push(`Survey sent to installers for ${s.survey.homeowner}. Quotes received: ${s.quotes.length}.`);
  if (s.booking) parts.push(`Site visit booked with ${s.booking.installer} on ${s.booking.day} at ${s.booking.time}.`);
  if (s.application) {
    const done = s.application.stagesDone;
    const e = s.application.eligibility;
    parts.push(
      `Subsidy application: ${done} of ${SUBSIDY_STEPS.length} stages done${done < SUBSIDY_STEPS.length ? `, next is "${SUBSIDY_STEPS[done].title}"` : ''}.${e ? ` Eligibility asked: ${eligibilityVerdict(e).verdict === 'ready' ? 'ready to apply' : eligibilityVerdict(e).verdict === 'fix' ? 'something to put right first' : 'some answers still unknown'}.` : ' Eligibility not asked yet.'}`,
    );
  }
  if (s.loan && s.design && s.loan.cost === s.design.grossCost) parts.push(`Loan worked out: ${inr(s.loan.instalment)} a month over ${s.loan.years} years.`);
  return parts.length ? parts.join(' ') : 'New conversation. Nothing is known yet.';
}
