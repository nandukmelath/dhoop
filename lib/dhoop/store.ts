import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Lang } from './config';
import type { Design } from './solar';
import type { Eligibility } from './steps';

/**
 * Shared state for one household's session, the installers' inbox and the hall map.
 *
 * It lives in the memory of one Node process and is saved to .data/store.json as a
 * best-effort backup. That is right for `next dev`, `next start`, or any single-instance
 * host. On serverless hosts with many instances, run a single instance or put a shared
 * store behind these same functions.
 */

export type View = 'welcome' | 'bill' | 'roof' | 'design' | 'compare' | 'steps' | 'quotes' | 'booked';

export interface Bill {
  monthlyUnits: number;
  amount: number;
  tariff: number;
  source: 'camera' | 'spoken' | 'form';
}

export interface Roof {
  areaM2: number;
  shadeFraction: number;
  usableM2: number;
  capacityKw: number;
  panelsFit: number;
  /** How the roof was measured. 'found' means Dhoop picked the building out itself, from a location or a tap. */
  source: 'model' | 'satellite' | 'spoken' | 'found';
  /** For a found roof: how Dhoop got to it. 'named' means the person asked for the building by name, 'voice' that they had the outline changed by speaking. */
  foundBy?: 'device' | 'tap' | 'named' | 'voice';
  /** For a found roof: what the place is called. Shown over the picture. */
  name?: string;
  /** For the model roof: which cells of the grid are sunlit (true) or shaded (false). */
  grid?: { cols: number; rows: number; lit: boolean[] };
  /** For a roof on the satellite view: its corners as [lat, lon], tapped by the person or found by Dhoop. */
  polygon?: [number, number][];
}

/** The neighbourhood around the home, added up: every roof within reach filled as far as it goes. An upper limit. */
export interface Street {
  /** Changes each time it is added up, so the screen knows to light the roofs again. */
  key: string;
  lat: number;
  lon: number;
  radiusM: number;
  roofs: number;
  roofM2: number;
  kw: number;
  panels: number;
  unitsAYear: number;
  /** What those units are worth at `tariff` rupees each. */
  rupeesAYear: number;
  tariff: number;
  /** The same electricity as this many homes that use what this home does. Only when a bill is known. */
  homesLikeThis?: number;
  co2TonnesAYear: number;
}

/** One of several named places set side by side for solar. */
export interface PlaceRow {
  label: string;
  lat: number;
  lon: number;
  /** Units a year from each kilowatt of panels there. */
  yieldKwhPerKw: number;
  /** Peak sun hours a day on a panel at the best tilt. */
  sunHours: number;
  /** That tilt, in degrees from flat, facing south. */
  tiltDeg?: number;
  tempC?: number;
  /** How far it falls behind the best of them, in percent. 0 for the best. */
  behindPercent: number;
}

/** One place compared for a solar farm. */
export interface SitePick {
  name: string;
  lat: number;
  lon: number;
  /** Units a year from each kilowatt of panels there. */
  yieldKwhPerKw: number;
  /** Peak sun hours a day on a panel at the best tilt. */
  sunHours: number;
  /** That tilt, in degrees from flat, facing south. */
  tiltDeg?: number;
  tempC?: number;
  elevationM?: number;
  /** Buildings standing within 400 metres, where that could be counted. */
  buildings?: number;
}

/**
 * Registered vendors put on the screen for a place. `scope` says how local the list is: the
 * district's own, where that was read, or otherwise the vendors with the most installations in
 * the whole state. `place` is that district or state; `district` is where the person is, when
 * the list is the state's.
 */
export interface VendorsShown {
  scope: 'district' | 'state';
  place: string;
  district?: string;
  readOn: string;
  list: { name: string; phone: string; rating: number; ratings: number; installs: number; kwp: number }[];
}

/**
 * The sunshine forecast for the home over the next days, from the weather service. It keeps
 * sun hours and not units, so the screen works the units out for whatever system is designed
 * now: a system resized by voice does not leave last minute's figures behind.
 */
export interface SunWeek {
  key: string;
  place: string;
  /** Today first. `sunHours` is the day's sunshine on flat ground, as peak sun hours. */
  days: { date: string; sunHours: number; sky: string; rainChance?: number }[];
  /** A usual day's sun hours in this month at this place, when the long-term figures are known. */
  usualSunHours?: number;
  fetchedAt: number;
  /** Set when the forecast came from the second source (see sky.ts) and not the usual one. */
  via?: string;
}

/**
 * The roof at this moment: today's sunshine hour by hour and what is reaching the ground now,
 * from the weather service. Like the week, it keeps sunshine and not kilowatts, and the screen
 * works the power out for the system that is designed now.
 */
export interface RoofNow {
  key: string;
  place: string;
  /** The local time the reading is for, as the service gave it: "2026-11-21T14:15". */
  at: string;
  isDay: boolean;
  /** Sunshine reaching flat ground at that moment, in watts a square metre. */
  sunNow: number;
  /** Today's 24 hours: the average over the hour that ends at each index, in watts a square metre. */
  hours: number[];
  /** Sunrise and sunset today, as clock times: "06:20", "17:50". */
  sunrise?: string;
  sunset?: string;
  /** Set when the reading came from the second source (see sky.ts) and not the usual one. */
  via?: string;
  /** The appliances the person asked about, by their keys in `APPLIANCES`. */
  asked?: string[];
  fetchedAt: number;
}

/** The practical side of a site for a solar farm: the grid, who can build it, and the money. */
export interface SiteDetails {
  district?: string;
  state?: string;
  /** The mapped substations near the site, nearest first. Null when the map could not be read. */
  substations: { name?: string; operator?: string; kv: number[]; km: number; way: string }[] | null;
  /** The registered vendors for the site: its district's list, or its state's. Missing only when the state could not be told. */
  vendors?: VendorsShown;
  money: {
    /** Rupees the electricity company pays a unit: one figure, or the middle of a range. */
    perUnit: number;
    perUnitRange?: [number, number];
    perUnitWhat: string;
    earnsAYear: number;
    /** What it costs to build, in rupees, land not counted: the low and the high estimate. */
    cost: [number, number];
    /** Years for the earnings to repay the cost, for the low and the high cost. Running costs, land and interest are not counted. */
    payback: [number, number];
  };
}

/** Where to build a solar farm of a given size: the best places found in an area, and why the first one won. */
export interface SiteSearch {
  /** Changes each time a search is made, so the screen knows to go there again. */
  key: string;
  capacityMw: number;
  region: string;
  /** How many places were compared. */
  compared: number;
  acres: number;
  /** The land as a square, in metres a side, for marking on the map. */
  sideM: number;
  unitsAYear: number;
  co2TonnesAYear: number;
  /** The best place first, then up to two more. */
  picks: SitePick[];
  reasons: string[];
  notChecked: string;
  details?: SiteDetails;
}

/** One change to the roof made by speaking, kept so that "undo that" can put the roof back. */
export interface RoofStep {
  /** The roof as it was before the change. */
  roof: Roof;
  /** Where the home was placed before the change. */
  at?: { lat: number; lon: number; label: string };
  /** What the change was, in a few words. */
  what: string;
  /** A mark of the roof the change made. The step can be undone only while that roof is still the one on screen. */
  after: string;
}

/** Where the device says it is, when the person allowed it to say. */
export interface DeviceSpot {
  lat: number;
  lon: number;
  /** How far off the device thinks it may be, in metres. A laptop on Wi-Fi can be 50 m or more out. */
  accuracyM: number;
  at: number;
  /** The spot the home was last found from, so a small drift does not move it again. */
  used?: { lat: number; lon: number };
}

export interface Quote {
  id: string;
  installer: string;
  price: number;
  days: number;
  note?: string;
  at: number;
  /** Set once the agent has told the homeowner about it. */
  announced?: boolean;
}

export interface LogLine {
  t: number;
  /** Short machine name of what happened, such as the tool that ran. */
  kind: string;
  /** One plain line for the screen. */
  text: string;
}

export interface Session {
  id: string;
  lang: Lang;
  createdAt: number;
  updatedAt: number;
  /** Goes up by one on every change, so screens can tell when to redraw. */
  rev: number;
  agentId?: string;
  /** The listening setup its current agent was started with, so a failure can be laid at the right recogniser's door. */
  listening?: string;
  view: View;
  location?: { label: string; lat: number; lon: number; sunHours: number; monthly: number[]; source: 'nasa' | 'default' };
  bill?: Bill;
  roof?: Roof;
  /** Changes to the roof made by speaking, oldest first, so the last ones can be undone. */
  roofSteps?: RoofStep[];
  /** What the whole neighbourhood could do, once the person has asked. It belongs to the roof it was made around. */
  street?: Street;
  /** The last search for a place to build a solar farm. The screen goes there until the talk turns back to the roof. */
  site?: SiteSearch;
  /** The solar story was asked for at this moment. A screen that sees a new key plays it. */
  story?: { key: string; at: number };
  /** Named places set side by side for solar, the best first. `forKw` is the system they were also worked out for, when one is designed. */
  places?: { key: string; rows: PlaceRow[]; reason: string; forKw?: number };
  /** This week's sunshine on the roof, from the weather forecast. It belongs to the place it was fetched for. */
  week?: SunWeek;
  /** The roof at this moment: today hour by hour, and what the sun covers now. It belongs to the place it was fetched for. */
  now?: RoofNow;
  /** The 25-year view was asked for, with this yearly rise in the price of electricity (nought: today's price). The sums are redone from the design on the screen. */
  longRun?: { key: string; priceRisePercent: number };
  /** The person asked aloud to carry on in another language. The call screen sees a new key and brings the agent back speaking it. */
  langAsk?: { to: Lang; key: string; at: number };
  /** Registered vendors asked for by place: "who installs solar in Jaipur?". `askedFor` is the place as it was found. */
  vendors?: VendorsShown & { key: string; askedFor: string };
  design?: Design;
  compare?: { a: Design; b: Design };
  stepsShown?: boolean;
  /** Where the household stands with its subsidy application: what it was asked, and how many of the ten stages are behind it. */
  application?: { eligibility?: Eligibility; stagesDone: number; updatedAt: number };
  /** The scheme's bank loan worked out for a design. `cost` is the price it was worked out for, so a later design can tell it is stale. */
  loan?: { cost: number; amount: number; own: number; years: number; instalment: number; instalmentAfterSubsidy: number; saving: number };
  /** The survey sent to installers. `kw` is the size they were asked to quote for. */
  survey?: { id: string; homeowner: string; sentAt: number; kw: number };
  quotes: Quote[];
  /** A booked site visit, as it was said. `at` is the moment it means, when the day and time could be read: with it, the visit can go into a calendar. */
  booking?: { id: string; installer: string; day: string; time: string; at?: string };
  log: LogLine[];
  /** The device's own location, shared live by the person's browser. Dhoop finds the building from it. */
  device?: DeviceSpot;
  /**
   * True while the home follows the device as it moves. It starts true with each call's first
   * location, and turns false once the person names a place or picks a building themselves,
   * so a later update from the device does not undo their choice.
   */
  followDevice?: boolean;
  /** What was said, copied from Agora before each agent stops so the next one can carry on. Oldest first. */
  turns?: Turn[];
  /** Whose words end `turns`, and how many, so saving the same agent twice replaces instead of repeating. */
  turnsFrom?: { agentId: string; count: number };
}

/** One thing said in a conversation. */
export interface Turn {
  role: 'user' | 'assistant';
  text: string;
}

export interface HallEntry {
  id: string;
  city: string;
  lat: number;
  lon: number;
  kw: number;
  monthlySavings: number;
  subsidy: number;
  at: number;
}

interface Db {
  sessions: Record<string, Session>;
  hall: HallEntry[];
}

const FILE_DIR = join(process.cwd(), '.data');
const FILE = join(FILE_DIR, 'store.json');
const g = globalThis as unknown as { __dhoopDb?: Db; __dhoopSave?: ReturnType<typeof setTimeout> };

function db(): Db {
  if (!g.__dhoopDb) {
    let loaded: Db | undefined;
    try {
      loaded = JSON.parse(readFileSync(FILE, 'utf8')) as Db;
    } catch {
      /* first run, or a read-only file system */
    }
    g.__dhoopDb = { sessions: loaded?.sessions ?? {}, hall: loaded?.hall ?? [] };
  }
  return g.__dhoopDb;
}

function saveSoon() {
  if (process.env.DHOOP_NO_PERSIST === '1' || g.__dhoopSave) return;
  g.__dhoopSave = setTimeout(() => {
    g.__dhoopSave = undefined;
    try {
      mkdirSync(FILE_DIR, { recursive: true });
      writeFileSync(FILE, JSON.stringify(db()));
    } catch {
      /* best effort only */
    }
  }, 500);
}

export const newId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 8)}`;

export function getSession(id: string): Session | undefined {
  return db().sessions[id];
}

export function ensureSession(id: string, lang: Lang = 'en'): Session {
  const d = db();
  if (!d.sessions[id]) {
    const now = Date.now();
    d.sessions[id] = { id, lang, createdAt: now, updatedAt: now, rev: 1, view: 'welcome', quotes: [], log: [] };
    saveSoon();
  }
  return d.sessions[id];
}

/** Apply a change to a session, bump its revision and optionally add a line to its action feed. */
/** Tells one home from another: its roof's size and first corner, or its place when no roof is outlined. */
const homeMark = (s: Session): string =>
  s.roof ? `${s.roof.areaM2.toFixed(1)}:${s.roof.polygon?.length ?? 0}:${s.roof.polygon?.[0]?.join(',') ?? ''}` : s.location ? `${s.location.lat.toFixed(4)},${s.location.lon.toFixed(4)}` : '';

/** Tells one place from another to about a kilometre, which is as fine as a weather forecast is. */
const placeMark = (s: Session): string => (s.location ? `${s.location.lat.toFixed(2)},${s.location.lon.toFixed(2)}` : '');

export function updateSession(id: string, change: (s: Session) => void, log?: { kind: string; text: string }): Session {
  const s = ensureSession(id);
  const homeWas = homeMark(s);
  const streetWas = s.street;
  const siteWas = s.site;
  const weekWas = s.week;
  const nowWas = s.now;
  const placeWas = placeMark(s);
  change(s);
  // A forecast is for one place: it goes when the home moves a kilometre or more.
  if (s.week && s.week === weekWas && placeMark(s) !== placeWas) s.week = undefined;
  if (s.now && s.now === nowWas && placeMark(s) !== placeWas) s.now = undefined;
  // The screen leaves a solar farm's site when the home's own roof changes.
  if (s.site && s.site === siteWas && homeMark(s) !== homeWas) s.site = undefined;
  // A neighbourhood is added up around one home. Another roof, or another place, leaves it stale.
  if (s.street && s.street === streetWas && homeMark(s) !== homeWas) s.street = undefined;
  if (log) {
    s.log.push({ t: Date.now(), ...log });
    if (s.log.length > 40) s.log.splice(0, s.log.length - 40);
  }
  s.updatedAt = Date.now();
  s.rev += 1;
  saveSoon();
  return s;
}

/** How much talk a session keeps. Enough to carry on, small enough to fit in the agent's instructions. */
export const MAX_TURNS = 40;

/** The session an agent belongs to. */
export function sessionOfAgent(agentId: string): Session | undefined {
  return Object.values(db().sessions).find((s) => s.agentId === agentId);
}

/**
 * Keep what one agent heard and said. Saving the same agent again replaces its earlier save,
 * so ending a call twice does not repeat the conversation. Returns how many turns are kept.
 */
export function rememberTurns(id: string, agentId: string, turns: Turn[]): number {
  const s = ensureSession(id);
  const kept = s.turns ?? [];
  if (s.turnsFrom?.agentId === agentId) kept.splice(Math.max(0, kept.length - s.turnsFrom.count));
  const added = turns.slice(-MAX_TURNS);
  s.turns = [...kept, ...added].slice(-MAX_TURNS);
  s.turnsFrom = { agentId, count: added.length };
  s.updatedAt = Date.now();
  saveSoon();
  return s.turns.length;
}

/** Sessions that have sent a survey to installers, newest first. */
export function surveysForInstallers(): Session[] {
  return Object.values(db().sessions)
    .filter((s) => s.survey)
    .sort((a, b) => (b.survey?.sentAt ?? 0) - (a.survey?.sentAt ?? 0))
    .slice(0, 20);
}

export function addHallEntry(e: Omit<HallEntry, 'id' | 'at'>): HallEntry {
  const entry: HallEntry = { ...e, id: newId('h'), at: Date.now() };
  const d = db();
  d.hall.push(entry);
  if (d.hall.length > 2000) d.hall.splice(0, d.hall.length - 2000);
  saveSoon();
  return entry;
}

export function hallSummary() {
  const hall = db().hall;
  return {
    count: hall.length,
    totalKw: Math.round(hall.reduce((s, e) => s + e.kw, 0) * 10) / 10,
    monthlySavings: Math.round(hall.reduce((s, e) => s + e.monthlySavings, 0)),
    subsidy: Math.round(hall.reduce((s, e) => s + e.subsidy, 0)),
    entries: hall.slice(-400).map(({ id, city, lat, lon, kw }) => ({ id, city, lat, lon, kw })),
  };
}

/** Test helper: start from a clean slate. */
export function resetStore() {
  g.__dhoopDb = { sessions: {}, hall: [] };
}
