import { ASSUMPTIONS } from './config';

/**
 * Drawing panels on a roof.
 *
 * How many panels a roof takes is worked out from its area (roofCapacity in solar.ts). This
 * file only decides where to draw that many, so the picture on the satellite view looks like
 * an installation: rows of upright panels along the roof's longest wall, clear of the edge,
 * with the walking gaps between rows that the sizing already allows for. It is a picture of
 * what fits, not an installer's drawing.
 *
 * Safe to import from a screen: plain geometry.
 */

/** The size of one panel of about 540 W, in metres. */
export const PANEL_M = { short: 1.13, long: 2.28 };
/** More than this and the picture is a blue smear. A larger roof is drawn in this many blocks; the count on screen still says how many panels fit. */
export const MOST_PANELS_DRAWN = 240;

const METRES_PER_DEGREE = 111_320;

/** Corners as [lat, lon]. */
type Ring = [number, number][];
type XY = [number, number];

function inside(p: XY, ring: XY[]): boolean {
  let within = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) within = !within;
  }
  return within;
}

/**
 * Up to `count` panels on a roof, each as its four corners in [lat, lon], in the order a crew
 * would lay them: row by row. Fewer come back when the shape cannot hold that many.
 */
export function layoutPanels(ring: Ring, count: number): Ring[] {
  const wanted = Math.min(Math.floor(count), MOST_PANELS_DRAWN);
  if (ring.length < 3 || wanted <= 0) return [];
  // A very large roof takes thousands of panels. Past the limit each rectangle drawn stands
  // for a block of panels and is that much larger, so the picture still covers the roof.
  const block = count > MOST_PANELS_DRAWN ? Math.sqrt(count / MOST_PANELS_DRAWN) : 1;

  // Work in metres around the middle of the roof.
  const lat0 = ring.reduce((sum, p) => sum + p[0], 0) / ring.length;
  const lon0 = ring.reduce((sum, p) => sum + p[1], 0) / ring.length;
  const east = METRES_PER_DEGREE * Math.cos((lat0 * Math.PI) / 180);
  const metres: XY[] = ring.map(([lat, lon]) => [(lon - lon0) * east, (lat - lat0) * METRES_PER_DEGREE]);

  // Turn the roof so that its longest wall lies flat. Rows then run along that wall.
  let longest = 0;
  let angle = 0;
  for (let i = 0; i < metres.length; i++) {
    const [ax, ay] = metres[i];
    const [bx, by] = metres[(i + 1) % metres.length];
    const length = Math.hypot(bx - ax, by - ay);
    if (length > longest) {
      longest = length;
      angle = Math.atan2(by - ay, bx - ax);
    }
  }
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const turned: XY[] = metres.map(([x, y]) => [x * cos + y * sin, -x * sin + y * cos]);
  const back = ([u, v]: XY): [number, number] => {
    const x = u * cos - v * sin;
    const y = u * sin + v * cos;
    return [lat0 + y / METRES_PER_DEGREE, lon0 + x / east];
  };

  const us = turned.map((p) => p[0]);
  const vs = turned.map((p) => p[1]);
  const [minU, maxU, minV, maxV] = [Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)];

  const w = PANEL_M.short * block;
  const h = PANEL_M.long * block;
  const pitchU = w + 0.05 * block;
  // The roof area the sizing gives each panel, gaps included. It sets how far apart rows start.
  const areaEach = ((ASSUMPTIONS.areaPerKwM2 * ASSUMPTIONS.panelWatts) / 1000) * block * block;

  /** Every place a panel fits on a grid with these row gaps, edge clearance and starting offsets. */
  const fitOn = (pitchV: number, clear: number, offU: number, offV: number): XY[] => {
    const spots: XY[] = [];
    for (let v = minV + clear + offV; v + h <= maxV - clear + 1e-9; v += pitchV) {
      for (let u = minU + clear + offU; u + w <= maxU - clear + 1e-9; u += pitchU) {
        // The panel and its clearance must be on the roof: test the corners and the middles of its sides.
        // The test reaches a hair less far than the clearance, so a panel set exactly that far
        // from a wall is not thrown out for touching the wall's line.
        const pad = clear - 0.03;
        const [u0, u1, v0, v1] = [u - pad, u + w + pad, v - pad, v + h + pad];
        const probes: XY[] = [[u0, v0], [u1, v0], [u1, v1], [u0, v1], [(u0 + u1) / 2, v0], [(u0 + u1) / 2, v1], [u0, (v0 + v1) / 2], [u1, (v0 + v1) / 2]];
        if (probes.every((p) => inside(p, turned))) spots.push([u, v]);
      }
    }
    return spots;
  };

  /** How far in a grid starts so that the room left over is shared between its two ends. */
  const shared = (room: number, size: number, pitch: number): number => {
    const spare = room - size;
    return spare > 0 ? (spare - Math.floor(spare / pitch) * pitch) / 2 : 0;
  };

  // Start with the gaps a real installation has. Tighten them only if the count does not fit.
  // Each try first sets the rows evenly on the roof, then shifts them to look for more room.
  let best: XY[] = [];
  search: for (const gap of [areaEach / pitchU, 3.6 * block, 3.0 * block, h + 0.3 * block]) {
    const pitchV = Math.max(gap, h + 0.3 * block);
    for (const clear of [0.5, 0.3, 0.15]) {
      const evenU = shared(maxU - minU - 2 * clear, w, pitchU);
      const evenV = shared(maxV - minV - 2 * clear, h, pitchV);
      const starts: XY[] = [[evenU, evenV], [0, evenV], [evenU, 0], [0, 0], [pitchU / 2, 0], [0, pitchV / 2], [pitchU / 2, pitchV / 2]];
      for (const [offU, offV] of starts) {
        const spots = fitOn(pitchV, clear, offU, offV);
        if (spots.length > best.length) best = spots;
        if (best.length >= wanted) break search;
      }
    }
  }

  // The middle of the roof is the centre of its area. The average of its corners would lean
  // towards whichever wall has the most detail.
  let twice = 0;
  let sumU = 0;
  let sumV = 0;
  for (let i = 0, j = turned.length - 1; i < turned.length; j = i++) {
    const cross = turned[j][0] * turned[i][1] - turned[i][0] * turned[j][1];
    twice += cross;
    sumU += (turned[j][0] + turned[i][0]) * cross;
    sumV += (turned[j][1] + turned[i][1]) * cross;
  }
  const mid: XY = Math.abs(twice) > 1e-6 ? [sumU / (3 * twice), sumV / (3 * twice)] : [(minU + maxU) / 2, (minV + maxV) / 2];

  // Keep whole rows, the ones nearest the middle first, and centre what is left in the last
  // row. Then put them in laying order: row by row.
  const rows = new Map<number, XY[]>();
  for (const spot of best) rows.set(spot[1], [...(rows.get(spot[1]) ?? []), spot]);
  const fromMiddle = [...rows.values()].sort((a, b) => Math.abs(a[0][1] + h / 2 - mid[1]) - Math.abs(b[0][1] + h / 2 - mid[1]));
  const chosen: XY[] = [];
  for (const row of fromMiddle) {
    const room = wanted - chosen.length;
    if (room <= 0) break;
    const alongRow = (p: XY) => Math.abs(p[0] + w / 2 - mid[0]);
    chosen.push(...(row.length <= room ? row : [...row].sort((a, b) => alongRow(a) - alongRow(b)).slice(0, room)));
  }
  chosen.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  return chosen.map(([u, v]) => [back([u, v]), back([u + w, v]), back([u + w, v + h]), back([u, v + h])]);
}
