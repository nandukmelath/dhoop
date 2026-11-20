import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import { PMTiles } from 'pmtiles';
import { tileAt } from './imagery';
import { polygonAreaM2 } from './solar';

/**
 * Finding a building from a spot on the map.
 *
 * The outlines come from the open building footprints that Google and Microsoft drew from
 * satellite pictures, merged with OpenStreetMap's, as published by VIDA on Source Cooperative.
 * It is one very large file (a PMTiles archive) that is read a small piece at a time, so there
 * is no key and no server of ours to keep running. In an Indian town it holds thousands of
 * outlines per neighbourhood, where OpenStreetMap alone has a handful.
 *
 * Server-only: screens ask through /api/session.
 */

const SOURCE = process.env.DHOOP_BUILDINGS_URL || 'https://data.source.coop/vida/google-microsoft-osm-open-buildings/pmtiles/goog_msft_osm.pmtiles';
/** The archive's deepest level, where every building is present. */
const ZOOM = 15;
/** Smaller than this is a shed or a mapping speck; larger is a factory or a mistake. */
const MIN_ROOF_M2 = 10;
const MAX_ROOF_M2 = 20_000;
const METRES_PER_DEGREE = 111_320;

/** Corners as [lat, lon], with the first corner not repeated at the end. */
export type Ring = [number, number][];

export interface Outline {
  ring: Ring;
  /** Who drew it: google, microsoft or osm. */
  source: string;
}

export interface Building extends Outline {
  areaM2: number;
  /** Metres from the spot asked about to the outline. 0 when the spot is inside it. */
  distanceM: number;
}

/** Metres east and north of an origin. Flat-earth maths, good over a few hundred metres. */
function metresFrom(origin: [number, number], p: [number, number]): [number, number] {
  return [(p[1] - origin[1]) * METRES_PER_DEGREE * Math.cos((origin[0] * Math.PI) / 180), (p[0] - origin[0]) * METRES_PER_DEGREE];
}

/** Whether a spot lies inside an outline. */
export function insideRing(spot: [number, number], ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [latI, lonI] = ring[i];
    const [latJ, lonJ] = ring[j];
    if (latI > spot[0] !== latJ > spot[0] && spot[1] < ((lonJ - lonI) * (spot[0] - latI)) / (latJ - latI) + lonI) inside = !inside;
  }
  return inside;
}

/** Metres from a spot to the nearest edge of an outline, or 0 when the spot is inside. */
export function distanceToRingM(spot: [number, number], ring: Ring): number {
  if (ring.length < 3) return Infinity;
  if (insideRing(spot, ring)) return 0;
  let best = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = metresFrom(spot, ring[j]);
    const [bx, by] = metresFrom(spot, ring[i]);
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSq = dx * dx + dy * dy;
    // How far along the edge the nearest point lies, held between its two ends.
    const t = lengthSq ? Math.min(1, Math.max(0, -(ax * dx + ay * dy) / lengthSq)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}

/**
 * Of the outlines around a spot, the one a person standing there most likely means: the
 * building the spot is inside (the smallest, if outlines overlap), otherwise the nearest
 * one within `withinM` metres.
 */
export function chooseBuilding(spot: [number, number], outlines: Outline[], withinM: number): Building | undefined {
  return measured(spot, outlines, withinM)[0];
}

/** The outlines within `withinM` metres of a spot, each with its size and distance, nearest first. */
export function measured(spot: [number, number], outlines: Outline[], withinM: number): Building[] {
  return outlines
    .map((o) => ({ ...o, areaM2: polygonAreaM2(o.ring), distanceM: distanceToRingM(spot, o.ring) }))
    .filter((b) => b.distanceM <= withinM && b.areaM2 >= MIN_ROOF_M2 && b.areaM2 <= MAX_ROOF_M2)
    .sort((a, b) => a.distanceM - b.distanceM || a.areaM2 - b.areaM2);
}

/** Smaller than this, an outline is more likely an annexe, a porch or one piece of a roof than a building anyone names or lives in. */
const ANNEXE_M2 = 60;

/**
 * The footprint data sometimes draws an annexe, or one piece of a roof, as an outline of its
 * own, right against the building it belongs to. When the outline picked is that small and a
 * much larger one stands against it, the larger one is the building meant. `near` is every
 * outline around the same spot, with its distance from the spot.
 *
 * Found at a science park in Kerala on 20 Nov 2026: the map's point for it fell inside a 36
 * square metre outline, with the 351 square metre building a third of a metre away.
 */
export function wholeBuilding(picked: Building, near: Building[]): Building {
  if (picked.areaM2 >= ANNEXE_M2) return picked;
  const against = near.filter((b) => b !== picked && b.distanceM <= picked.distanceM + 5 && b.areaM2 >= picked.areaM2 * 3).sort((a, b) => b.areaM2 - a.areaM2)[0];
  return against ?? picked;
}

/**
 * Of the buildings around a named place, the one the name most likely stands for.
 *
 * A name is not a person standing somewhere, so "the nearest" is the wrong rule for it. The
 * middle of a palace's grounds is nearest to a ticket kiosk, and the middle of a mall drawn
 * in pieces is nearest to its smallest piece. So the main building wins: the largest one
 * within reach, counted for a little less the further out it stands. A place the map marks as
 * a single point is different: the building that holds the point is the one.
 * `near` is what buildingsNear returned for the same reach.
 */
export function chooseNamedBuilding(near: Building[], withinM: number, isPoint: boolean): Building | undefined {
  if (isPoint) {
    const holding = near.filter((b) => b.distanceM === 0).sort((a, b) => b.areaM2 - a.areaM2)[0];
    if (holding) return wholeBuilding(holding, near);
  }
  const worth = (b: Building) => b.areaM2 * (1 - (0.5 * b.distanceM) / Math.max(withinM, 1));
  return [...near].sort((a, b) => worth(b) - worth(a))[0];
}

const g = globalThis as unknown as { __dhoopBuildings?: PMTiles; __dhoopOutlines?: Map<string, Promise<Outline[]>> };

async function loadTile(x: number, y: number): Promise<Outline[]> {
  const archive = (g.__dhoopBuildings ??= new PMTiles(SOURCE));
  const tile = await archive.getZxy(ZOOM, x, y, AbortSignal.timeout(12_000));
  if (!tile?.data) return [];
  const layer = Object.values(new VectorTile(new PbfReader(new Uint8Array(tile.data))).layers)[0];
  const outlines: Outline[] = [];
  for (let i = 0; i < (layer?.length ?? 0); i++) {
    const feature = layer.feature(i);
    const geometry = feature.toGeoJSON(x, y, ZOOM).geometry;
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
    for (const polygon of polygons) {
      // The outer edge only. Its last corner repeats the first, which Dhoop does not keep.
      const ring = (polygon[0] ?? []).slice(0, -1).map(([lon, lat]) => [lat, lon] as [number, number]);
      if (ring.length >= 3) outlines.push({ ring, source: String(feature.properties.bf_source ?? '') });
    }
  }
  return outlines;
}

/** Every outline in one map tile. Remembered for a while, so tapping around a street is quick. */
function outlinesInTile(x: number, y: number): Promise<Outline[]> {
  const remembered = (g.__dhoopOutlines ??= new Map());
  const key = `${x}/${y}`;
  let tile = remembered.get(key);
  if (!tile) {
    tile = loadTile(x, y).catch((error) => {
      remembered.delete(key);
      throw error;
    });
    remembered.set(key, tile);
    if (remembered.size > 16) remembered.delete(remembered.keys().next().value as string);
  }
  return tile;
}

/**
 * The building at or nearest to a spot, within `withinM` metres. Looks in the neighbouring
 * map tile too when the spot is close to a tile's edge. Throws when the data cannot be read.
 */
export async function buildingAt(lat: number, lon: number, withinM: number): Promise<Building | undefined> {
  return (await buildingsNear(lat, lon, withinM))[0];
}

/** Every building within `withinM` metres of a spot, nearest first. Throws when the data cannot be read. */
export async function buildingsNear(lat: number, lon: number, withinM: number): Promise<Building[]> {
  const reach = (withinM + 40) / METRES_PER_DEGREE;
  const reachLon = reach / Math.cos((lat * Math.PI) / 180);
  const tiles = new Map<string, { x: number; y: number }>();
  for (const [dLat, dLon] of [[0, 0], [reach, reachLon], [reach, -reachLon], [-reach, reachLon], [-reach, -reachLon]]) {
    const t = tileAt(lat + dLat, lon + dLon, ZOOM);
    tiles.set(`${t.x}/${t.y}`, t);
  }
  const outlines = (await Promise.all([...tiles.values()].map((t) => outlinesInTile(t.x, t.y)))).flat();
  return measured([lat, lon], outlines, withinM);
}
