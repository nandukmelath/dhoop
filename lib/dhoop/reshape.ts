import type { Ring } from './buildings';

/**
 * Changing a roof's outline by word of mouth.
 *
 * "Add 300 square metres on the right." "Leave out a quarter on the left, that part is my
 * neighbour's." "Not this building, the next one to the right." The agent's tools turn
 * sentences like these into a side and an amount; this file does the geometry.
 *
 * Sides are as a person sees the satellite picture, which has north at the top. A building is
 * rarely square to the compass, and a roof that grows should keep its walls straight. So "the
 * right side" is the side of the building that faces most nearly right, and the roof grows or
 * shrinks along the building's own lines, not the compass's.
 *
 * Safe to import from a screen: plain geometry.
 */

type XY = [number, number];

export type Side = 'left' | 'right' | 'top' | 'bottom';
export const SIDES: readonly Side[] = ['left', 'right', 'top', 'bottom'];

/** Which way each side points on the picture: metres east, metres north. */
const POINTING: Record<Side, XY> = { right: [1, 0], left: [-1, 0], top: [0, 1], bottom: [0, -1] };
const COMPASS = ['east', 'north-east', 'north', 'north-west', 'west', 'south-west', 'south', 'south-east'];

// The same metres per degree that polygonAreaM2 uses, so areas agree with it.
const M_PER_DEG_LAT = 111_132;
const M_PER_DEG_LON = 111_320;

export interface Reshaped {
  ring: Ring;
  /** The compass side that moved, when one side was changed. */
  facing?: string;
  /** How far that side moved, in metres. */
  movedM?: number;
  /** How long that side is, in metres. */
  acrossM?: number;
}

/** A flat sheet laid over the building: metres east and north of its corners' middle, and the way back. */
function sheet(ring: Ring) {
  const lat0 = ring.reduce((sum, p) => sum + p[0], 0) / ring.length;
  const lon0 = ring.reduce((sum, p) => sum + p[1], 0) / ring.length;
  const kx = M_PER_DEG_LON * Math.cos((lat0 * Math.PI) / 180);
  return {
    to: (p: [number, number]): XY => [(p[1] - lon0) * kx, (p[0] - lat0) * M_PER_DEG_LAT],
    back: (p: XY): [number, number] => [lat0 + p[1] / M_PER_DEG_LAT, lon0 + p[0] / kx],
  };
}

/** Area with a sign: positive when the corners run counter-clockwise. */
function signedArea(p: XY[]): number {
  let twice = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i];
    const [x2, y2] = p[(i + 1) % p.length];
    twice += x1 * y2 - x2 * y1;
  }
  return twice / 2;
}

/** The middle of a shape by area, not by corners: a wall drawn with many corners does not pull it over. */
function centre(p: XY[]): XY {
  let twice = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i];
    const [x2, y2] = p[(i + 1) % p.length];
    const w = x1 * y2 - x2 * y1;
    twice += w;
    cx += (x1 + x2) * w;
    cy += (y1 + y2) * w;
  }
  if (Math.abs(twice) < 1e-9) return [p.reduce((s, q) => s + q[0], 0) / p.length, p.reduce((s, q) => s + q[1], 0) / p.length];
  return [cx / (3 * twice), cy / (3 * twice)];
}

function holds(spot: XY, p: XY[]): boolean {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i];
    const [xj, yj] = p[j];
    if (yi > spot[1] !== yj > spot[1] && spot[0] < ((xj - xi) * (spot[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Drop corners that repeat the one before, and corners that lie on the straight line between their neighbours. */
function tidy(p: XY[]): XY[] {
  const out = p.filter((q, i) => {
    const before = p[(i + p.length - 1) % p.length];
    return Math.hypot(q[0] - before[0], q[1] - before[1]) > 0.02;
  });
  for (let i = 0; i < out.length && out.length > 3; i++) {
    const a = out[(i + out.length - 1) % out.length];
    const b = out[i];
    const c = out[(i + 1) % out.length];
    const span = Math.hypot(c[0] - a[0], c[1] - a[1]);
    const off = span > 0 ? Math.abs((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / span : 0;
    const between = (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]) > 0;
    if (off < 0.03 && between) {
      out.splice(i, 1);
      i = Math.max(-1, i - 2);
    }
  }
  return out;
}

/** Whether any two walls of an outline cross each other. A roof's never do. */
function tangled(p: XY[]): boolean {
  const turn = (a: XY, b: XY, c: XY) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const n = p.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const [a, b, c, d] = [p[i], p[(i + 1) % n], p[j], p[(j + 1) % n]];
      const d1 = turn(a, b, c);
      const d2 = turn(a, b, d);
      const d3 = turn(c, d, a);
      const d4 = turn(c, d, b);
      if (((d1 > 1e-6 && d2 < -1e-6) || (d1 < -1e-6 && d2 > 1e-6)) && ((d3 > 1e-6 && d4 < -1e-6) || (d3 < -1e-6 && d4 > 1e-6))) return true;
    }
  }
  return false;
}

/**
 * The way a building's walls run, as an angle between -45 and 45 degrees from east. Walls at
 * right angles to each other count as running the same way, and long walls count for more.
 */
function grain(p: XY[]): number {
  let c = 0;
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const dx = p[(i + 1) % p.length][0] - p[i][0];
    const dy = p[(i + 1) % p.length][1] - p[i][1];
    const length = Math.hypot(dx, dy);
    if (length < 0.05) continue;
    const a = Math.atan2(dy, dx) * 4;
    c += length * Math.cos(a);
    s += length * Math.sin(a);
  }
  return Math.atan2(s, c) / 4;
}

/** The direction, along the building's own walls, that points most nearly to a side of the picture. */
function facing(p: XY[], side: Side): XY {
  const base = grain(p);
  const want = POINTING[side];
  let best: XY = want;
  let bestDot = -Infinity;
  for (let k = 0; k < 4; k++) {
    const v: XY = [Math.cos(base + (k * Math.PI) / 2), Math.sin(base + (k * Math.PI) / 2)];
    const dot = v[0] * want[0] + v[1] * want[1];
    if (dot > bestDot + 1e-9) {
      bestDot = dot;
      best = v;
    }
  }
  return best;
}

const compass = (v: XY) => COMPASS[((Math.round(Math.atan2(v[1], v[0]) / (Math.PI / 4)) % 8) + 8) % 8];

/**
 * Move one whole side of a roof outwards until the roof has grown by `addM2`.
 *
 * The outline is split at its two widest points, seen from the side that moves. The half
 * behind them stays where it is; the half in front slides straight out. A rectangle becomes a
 * longer rectangle, an L keeps its shape, and the area gained is exactly the width times the
 * distance moved, whatever the shape.
 */
function grow(start: XY[], side: Side, addM2: number): { p: XY[]; v: XY; movedM: number; acrossM: number } | null {
  const p = signedArea(start) < 0 ? [...start].reverse() : start;
  const v = facing(p, side);
  const along = p.map((q) => q[0] * v[0] + q[1] * v[1]);
  // Across runs a quarter turn counter-clockwise from the way the side moves.
  const across = p.map((q) => -q[0] * v[1] + q[1] * v[0]);
  let low = 0;
  let high = 0;
  for (let i = 1; i < p.length; i++) {
    if (across[i] < across[low] - 0.02 || (Math.abs(across[i] - across[low]) <= 0.02 && along[i] > along[low])) low = i;
    if (across[i] > across[high] + 0.02 || (Math.abs(across[i] - across[high]) <= 0.02 && along[i] > along[high])) high = i;
  }
  const acrossM = across[high] - across[low];
  if (acrossM < 0.5 || low === high) return null;
  const movedM = addM2 / acrossM;
  if (movedM > 500) return null;
  const out: XY[] = [];
  // Counter-clockwise, the back of the building runs from the high point round to the low one.
  for (let i = high; ; i = (i + 1) % p.length) {
    out.push(p[i]);
    if (i === low) break;
  }
  // And the front runs from the low point up to the high one. It moves out.
  for (let i = low; ; i = (i + 1) % p.length) {
    out.push([p[i][0] + v[0] * movedM, p[i][1] + v[1] * movedM]);
    if (i === high) break;
  }
  const done = tidy(out);
  if (done.length < 3 || tangled(done)) return null;
  const gained = Math.abs(signedArea(done)) - Math.abs(signedArea(p));
  if (Math.abs(gained - addM2) > Math.max(1, addM2 * 0.02)) return null;
  return { p: done, v, movedM, acrossM };
}

/** The part of an outline on the near side of a straight cut: every point no further than `t` along `v`. */
function cut(p: XY[], v: XY, t: number): XY[] {
  const out: XY[] = [];
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    const da = a[0] * v[0] + a[1] * v[1] - t;
    const db = b[0] * v[0] + b[1] * v[1] - t;
    if (da <= 0) out.push(a);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const k = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]);
    }
  }
  return out;
}

/** Cut a strip off one side of a roof, straight across, until `removeM2` has gone. */
function trim(start: XY[], side: Side, removeM2: number): { p: XY[]; v: XY; movedM: number; acrossM: number } | null {
  const p = signedArea(start) < 0 ? [...start].reverse() : start;
  const whole = Math.abs(signedArea(p));
  if (removeM2 >= whole) return null;
  const v = facing(p, side);
  const along = p.map((q) => q[0] * v[0] + q[1] * v[1]);
  const far = Math.max(...along);
  let near = Math.min(...along);
  let edge = far;
  // What is kept grows as the cut moves out, so the right place is found by halving.
  for (let k = 0; k < 48; k++) {
    const mid = (near + edge) / 2;
    if (Math.abs(signedArea(cut(p, v, mid))) > whole - removeM2) edge = mid;
    else near = mid;
  }
  const done = tidy(cut(p, v, (near + edge) / 2));
  if (done.length < 3) return null;
  const movedM = far - (near + edge) / 2;
  return { p: done, v, movedM, acrossM: movedM > 0 ? removeM2 / movedM : 0 };
}

/**
 * A roof's outline made bigger or smaller by `m2` square metres, on one side or all round.
 * Null when it cannot be done: nothing would be left, or the outline is too tangled to move
 * one side of. All round, the roof keeps its shape and its middle.
 */
export function reshapeRing(ring: Ring, change: 'add' | 'remove', side: Side | 'all_round', m2: number): Reshaped | null {
  if (ring.length < 3 || !(m2 > 0)) return null;
  const { to, back } = sheet(ring);
  const p = tidy(ring.map(to));
  if (p.length < 3) return null;
  const whole = Math.abs(signedArea(p));
  if (whole < 1 || (change === 'remove' && m2 >= whole - 1)) return null;
  if (side === 'all_round') {
    const mid = centre(p);
    const k = Math.sqrt((change === 'add' ? whole + m2 : whole - m2) / whole);
    return { ring: p.map((q) => back([mid[0] + (q[0] - mid[0]) * k, mid[1] + (q[1] - mid[1]) * k])) };
  }
  const made = change === 'add' ? grow(p, side, m2) : trim(p, side, m2);
  if (!made) return null;
  return { ring: made.p.map(back), facing: compass(made.v), movedM: made.movedM, acrossM: made.acrossM };
}

/**
 * The same outline moved over by so many metres towards a side of the picture. Its shape and
 * size stay as they are. For when the outline and the satellite picture do not quite line up:
 * the two come from different sources and can sit a few metres apart.
 */
export function shiftRing(ring: Ring, side: Side, metres: number): Ring {
  if (ring.length < 3 || !(metres > 0)) return ring;
  const { to, back } = sheet(ring);
  const [dx, dy] = POINTING[side];
  return ring.map((p) => {
    const [x, y] = to(p);
    return back([x + dx * metres, y + dy * metres]);
  });
}

/** The middle of an outline, as [lat, lon]. */
export function middleOf(ring: Ring): [number, number] {
  const { to, back } = sheet(ring);
  return back(centre(ring.map(to)));
}

/** Metres from an outline's middle to its furthest corner. */
export function reachOf(ring: Ring): number {
  const { to } = sheet(ring);
  const p = ring.map(to);
  const mid = centre(p);
  return Math.max(...p.map((q) => Math.hypot(q[0] - mid[0], q[1] - mid[1])));
}

/**
 * Of the buildings around the one outlined, the next one over on a side of the picture.
 *
 * "Next" is the nearest building whose middle lies that way: more ahead than off to the side,
 * and with being off to the side counted against it twice over. So along a street the
 * neighbour wins over the house beyond it, and over the one diagonally across the road.
 * The building already outlined is left out, under whichever map source drew it.
 */
export function neighbourIn<T extends { ring: Ring }>(current: Ring, others: T[], side: Side): { building: T; metresAway: number } | undefined {
  if (current.length < 3) return undefined;
  const { to } = sheet(current);
  const here = current.map(to);
  const from = centre(here);
  const v = POINTING[side];
  let best: { building: T; metresAway: number } | undefined;
  let bestScore = Infinity;
  for (const other of others) {
    if (other.ring.length < 3) continue;
    const there = other.ring.map(to);
    const mid = centre(there);
    const dx = mid[0] - from[0];
    const dy = mid[1] - from[1];
    const ahead = dx * v[0] + dy * v[1];
    const aside = Math.abs(-dx * v[1] + dy * v[0]);
    if (ahead < 2 || aside > ahead * 1.2) continue;
    // The same building under another outline holds this one's middle, or has its own middle inside this one.
    if (holds(mid, here) || holds(from, there)) continue;
    const score = ahead + 2 * aside;
    if (score < bestScore) {
      bestScore = score;
      best = { building: other, metresAway: Math.hypot(dx, dy) };
    }
  }
  return best;
}
