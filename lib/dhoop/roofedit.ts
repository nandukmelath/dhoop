import { buildingsNear, type Building } from './buildings';
import { SQFT_PER_M2 } from './config';
import { DEFAULT_SHADE } from './findroof';
import { middleOf, neighbourIn, reachOf, reshapeRing, shiftRing, type Side } from './reshape';
import { polygonAreaM2, roofCapacity } from './solar';
import { ensureSession, updateSession, type Roof, type RoofStep, type Session } from './store';

/**
 * Changing the roof on the screen by speaking.
 *
 * Three things a person says when the outline is not quite right: "the roof goes further on
 * that side" or "that part is not mine" (changeRoof), "not this building, the next one over"
 * (nextBuilding), and "no, put it back" (undoRoof). Each redraws the outline at once and
 * measures the roof again. The geometry is in reshape.ts; this file keeps the session.
 *
 * Every change is kept as a step, so the last few can be undone. Like every way of choosing
 * a roof by hand, a change stops the device's location from moving the home.
 */

type Result = Record<string, unknown>;

/** A roof changed by voice stays between a shed and an airport terminal, in square metres. */
const ROOF_M2 = { least: 10, most: 200_000 };
/** How many changes are kept for "undo that". */
const STEPS_KEPT = 6;

const sqft = (m2: number) => Math.round(m2 * SQFT_PER_M2);
const count = (n: number) => Math.round(n).toLocaleString('en-IN');

const CHANGE_WORDS: Record<Side | 'all_round', string> = { left: 'on the left', right: 'on the right', top: 'at the top', bottom: 'at the bottom', all_round: 'all round' };
const MOVE_WORDS: Record<Side, string> = { left: 'to the left', right: 'to the right', top: 'above', bottom: 'below' };

/** A mark that tells one roof from another: how it was measured, its size and its first corner. */
export const roofMark = (r?: Roof): string =>
  r ? `${r.source}:${r.areaM2.toFixed(1)}:${r.polygon?.length ?? 0}:${r.polygon?.[0]?.map((n) => n.toFixed(6)).join(',') ?? ''}` : 'none';

/** The steps that lead to the roof now on screen. A roof found or drawn afresh has none. */
function stepsFor(s: Session): RoofStep[] {
  const steps = s.roofSteps ?? [];
  return steps.length && steps[steps.length - 1].after === roofMark(s.roof) ? steps : [];
}

const placeOf = (s: Session) => (s.location ? { lat: s.location.lat, lon: s.location.lon, label: s.location.label } : undefined);

/** A roof's numbers in a shape the model can read out. */
function sizes(r: Roof): Result {
  return {
    roof_area_sqft: sqft(r.areaM2),
    roof_area_square_metres: Math.round(r.areaM2),
    usable_area_sqft: sqft(r.usableM2),
    panels_that_fit: r.panelsFit,
    largest_system_kw: r.capacityKw,
  };
}

export interface RoofAsk {
  change: 'add' | 'remove';
  side: Side | 'all_round';
  amount: number;
  unit: 'square_metres' | 'square_feet' | 'percent';
}

/** Make the roof bigger or smaller by an area, on one side or all round, and measure it again. */
export function changeRoof(sid: string, ask: RoofAsk): Result {
  const s = ensureSession(sid);
  const r = s.roof;
  if (!r) return { ok: false, error: 'No roof is known yet.', next: 'Find the roof first: call findMyRoof, or findBuilding with a name. Then make the change.' };
  if (r.source === 'model') {
    return { ok: false, error: 'This roof was measured by the camera on a table-top model. It changes when the camera sees it change.', next: 'Say so, and offer to find the real building with findMyRoof.' };
  }
  if (!(ask.amount > 0)) return { ok: false, error: 'Need how much to add or leave out.', next: 'Ask how many square metres or square feet.' };
  const m2 = ask.unit === 'percent' ? (r.areaM2 * ask.amount) / 100 : ask.unit === 'square_feet' ? ask.amount / SQFT_PER_M2 : ask.amount;
  const target = ask.change === 'add' ? r.areaM2 + m2 : r.areaM2 - m2;
  if (m2 < 0.5) return { ok: false, error: 'That is too small a change to draw.', ...sizes(r), next: 'Ask the person to say the figure again.' };
  if (target < ROOF_M2.least) return { ok: false, error: 'That would leave no roof to put panels on.', ...sizes(r), next: 'Tell the person how big the roof is now, and ask how much to leave out.' };
  if (target > ROOF_M2.most) return { ok: false, error: 'That is bigger than any one roof.', ...sizes(r), next: 'Ask the person to say the figure again.' };

  const outline = r.polygon && r.polygon.length >= 3 ? r.polygon : undefined;
  let shaped = outline ? reshapeRing(outline, ask.change, ask.side, m2) : null;
  // An outline too tangled to move one side of can still grow or shrink evenly.
  let evenly = false;
  if (outline && !shaped && ask.side !== 'all_round') {
    shaped = reshapeRing(outline, ask.change, 'all_round', m2);
    evenly = !!shaped;
  }
  if (outline && !shaped) {
    return { ok: false, error: 'The outline could not be changed that way.', ...sizes(r), next: 'Say so, and ask the person to mark the corners of the roof on the screen instead, then call getRoofSurvey.' };
  }

  const areaM2 = shaped ? polygonAreaM2(shaped.ring) : target;
  const cap = roofCapacity(areaM2, r.shadeFraction);
  const roof: Roof = {
    ...r,
    areaM2,
    usableM2: cap.usableM2,
    capacityKw: cap.kw,
    panelsFit: cap.panels,
    // A redrawn outline is Dhoop's own, so the satellite view is rebuilt around it.
    ...(shaped ? { polygon: shaped.ring, source: 'found' as const, foundBy: 'voice' as const } : {}),
  };
  const what = `${ask.change === 'add' ? 'Added' : 'Left out'} ${count(m2)} sq m ${CHANGE_WORDS[evenly ? 'all_round' : ask.side]}`;
  updateSession(
    sid,
    (x) => {
      x.roofSteps = [...stepsFor(x), { roof: r, at: placeOf(x), what, after: roofMark(roof) }].slice(-STEPS_KEPT);
      x.roof = roof;
      x.followDevice = false;
      x.view = 'roof';
    },
    { kind: 'changeRoof', text: `${what}: the roof is now ${count(sqft(areaM2))} sq ft, room for ${cap.panels} panels` },
  );
  return {
    ok: true,
    done: what,
    area_changed_square_metres: Math.round(m2),
    area_changed_sqft: sqft(m2),
    ...(shaped?.facing && !evenly ? { side_that_moved: `the ${ask.side} of the picture, which is the ${shaped.facing} side of the building`, side_moved_by_metres: Math.round((shaped.movedM ?? 0) * 10) / 10 } : {}),
    ...(evenly ? { one_side_could_not_be_moved: 'The outline is too irregular to move one side of, so the roof was changed evenly all round instead.' } : {}),
    ...(outline ? {} : { only_the_size_changed: 'This roof was given as a size and has no outline on the screen.' }),
    panels_before: r.panelsFit,
    ...sizes(roof),
    can_be_undone: true,
  };
}

/** Slide the outline over, as it is, towards a side of the picture. The roof's size does not change. */
export function moveRoof(sid: string, side: Side, metres: number): Result {
  const s = ensureSession(sid);
  const r = s.roof;
  if (!r?.polygon || r.polygon.length < 3) {
    return { ok: false, error: 'No roof is outlined on the screen yet.', next: 'Find one first: call findMyRoof, or findBuilding with a name.' };
  }
  if (!(metres >= 0.3)) return { ok: false, error: 'Need how far to move it.', next: 'Ask how many metres or feet. A few metres is usual.' };
  if (metres > 60) return { ok: false, error: 'That is too far for a correction: it would land on another building.', next: 'If they mean another building, call nextBuilding, or ask them to tap it on the screen.' };
  const polygon = shiftRing(r.polygon, side, metres);
  const roof: Roof = { ...r, polygon, source: 'found', foundBy: 'voice' };
  const what = `Moved the outline ${Math.round(metres * 10) / 10} m ${MOVE_WORDS[side] === 'above' ? 'up' : MOVE_WORDS[side] === 'below' ? 'down' : MOVE_WORDS[side]}`;
  updateSession(
    sid,
    (x) => {
      x.roofSteps = [...stepsFor(x), { roof: r, at: placeOf(x), what, after: roofMark(roof) }].slice(-STEPS_KEPT);
      x.roof = roof;
      x.followDevice = false;
      x.view = 'roof';
    },
    { kind: 'moveRoof', text: `${what}. The roof is the same size: ${count(sqft(r.areaM2))} sq ft` },
  );
  return { ok: true, done: what, moved_metres: Math.round(metres * 10) / 10, the_roof_is_the_same_size: true, ...sizes(roof), can_be_undone: true };
}

/** Move the outline to the neighbouring building on one side of the picture, and measure that one. */
export async function nextBuilding(sid: string, side: Side): Promise<Result> {
  const s = ensureSession(sid);
  const r = s.roof;
  if (!r?.polygon || r.polygon.length < 3) {
    return { ok: false, found: false, error: 'No building is outlined on the screen yet.', next: 'Find one first: call findMyRoof, or findBuilding with a name.' };
  }
  const [lat, lon] = middleOf(r.polygon);
  let near: Building[];
  try {
    near = await buildingsNear(lat, lon, Math.min(reachOf(r.polygon) + 80, 400));
  } catch (error) {
    console.warn('Building lookup failed:', error instanceof Error ? error.message.slice(0, 120) : error);
    return { ok: false, found: false, error: 'The building data could not be reached.', next: 'Ask the person to tap the building they mean on the screen, then call getRoofSurvey.' };
  }
  const next = neighbourIn(r.polygon, near, side);
  if (!next) {
    return { ok: false, found: false, error: 'No building is mapped close by on that side.', next: 'Say so, and ask the person to tap the building they mean on the screen, then call getRoofSurvey.' };
  }
  const b = next.building;
  const cap = roofCapacity(b.areaM2, DEFAULT_SHADE);
  const [toLat, toLon] = middleOf(b.ring);
  // A name the person asked for belongs to the building they asked for, not to its neighbour.
  const named = r.foundBy === 'named';
  const roof: Roof = { areaM2: b.areaM2, shadeFraction: DEFAULT_SHADE, usableM2: cap.usableM2, capacityKw: cap.kw, panelsFit: cap.panels, source: 'found', foundBy: 'tap', name: named ? undefined : r.name, polygon: b.ring };
  const what = `Moved to the next building ${MOVE_WORDS[side]}`;
  updateSession(
    sid,
    (x) => {
      x.roofSteps = [...stepsFor(x), { roof: r, at: placeOf(x), what, after: roofMark(roof) }].slice(-STEPS_KEPT);
      x.roof = roof;
      if (x.location) Object.assign(x.location, { lat: toLat, lon: toLon, ...(named && !x.location.label.startsWith('Near ') ? { label: `Near ${x.location.label}` } : {}) });
      x.followDevice = false;
      x.view = 'roof';
    },
    { kind: 'nextBuilding', text: `${what}: ${count(sqft(b.areaM2))} sq ft, room for ${cap.panels} panels` },
  );
  return {
    ok: true,
    found: true,
    done: what,
    metres_from_the_last_building: Math.round(next.metresAway),
    ...sizes(roof),
    can_be_undone: true,
    caution: 'The outline comes from satellite data and is a pre-survey estimate. An installer confirms it on site.',
  };
}

/** Put the roof back as it was before the last change made by speaking. */
export function undoRoof(sid: string): Result {
  const s = ensureSession(sid);
  const steps = stepsFor(s);
  const last = steps[steps.length - 1];
  if (!last) return { ok: false, error: 'There is no change to the roof to undo.', next: 'Say so in a few words.' };
  updateSession(
    sid,
    (x) => {
      x.roof = last.roof;
      if (x.location && last.at) Object.assign(x.location, last.at);
      x.roofSteps = steps.slice(0, -1);
      x.followDevice = false;
      x.view = 'roof';
    },
    { kind: 'undoRoofChange', text: `Undone (${last.what.charAt(0).toLowerCase()}${last.what.slice(1)}): the roof is back to ${count(sqft(last.roof.areaM2))} sq ft, room for ${last.roof.panelsFit} panels` },
  );
  return { ok: true, undone: last.what, ...sizes(last.roof), more_changes_that_can_be_undone: steps.length - 1 };
}
