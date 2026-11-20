import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import { tileAt } from './imagery';

/**
 * The electricity substations near a spot.
 *
 * A solar farm is worth nothing until its power can be fed in, and the scheme for small farms
 * asks for the plant to stand within five kilometres of a substation. The substations here are
 * the ones mapped in OpenStreetMap, read from OpenInfraMap's map tiles, a few small tiles round
 * the spot. OpenStreetMap's own query service was tried first and was at capacity or timing out.
 *
 * What it knows: where a substation is, often its voltages and who runs it, sometimes its name.
 * What it does not know: whether the substation has room for more power. The electricity
 * company publishes that, substation by substation, and it has to be asked. And the map is not
 * complete: small substations are often missing, so the nearest one on the map may not be the
 * nearest one on the ground.
 *
 * Server-only.
 */

export interface Substation {
  name?: string;
  operator?: string;
  /** Its voltages in kilovolts, highest first. Empty when the map does not say. */
  kv: number[];
  km: number;
  lat: number;
  lon: number;
}

const ZOOM = 11;
const g = globalThis as unknown as { __dhoopGrid?: Map<string, Promise<Substation[]>> };

async function loadTile(x: number, y: number): Promise<Substation[]> {
  const res = await fetch(`https://openinframap.org/tiles/${ZOOM}/${x}/${y}.pbf`, { headers: { 'User-Agent': 'dhoop-solar-demo' }, signal: AbortSignal.timeout(6000) });
  if (res.status === 204 || res.status === 404) return [];
  if (!res.ok) throw new Error(String(res.status));
  const layer = new VectorTile(new PbfReader(new Uint8Array(await res.arrayBuffer()))).layers.power_substation_point;
  const out: Substation[] = [];
  for (let i = 0; i < (layer?.length ?? 0); i++) {
    const feature = layer.feature(i);
    const p = feature.properties as Record<string, string | number | boolean | undefined>;
    if (p.construction === true || p.disused === true) continue;
    const geometry = feature.toGeoJSON(x, y, ZOOM).geometry;
    if (geometry.type !== 'Point') continue;
    const kv = [p.voltage, p.voltage_2, p.voltage_3].map((v) => Math.round(Number(v) * 10) / 10).filter((v) => v > 0).sort((a, b) => b - a);
    out.push({ name: p.name ? String(p.name) : undefined, operator: p.operator ? String(p.operator) : undefined, kv, km: 0, lat: geometry.coordinates[1], lon: geometry.coordinates[0] });
  }
  return out;
}

/** The mapped substations within `withinKm` of a spot, nearest first. Throws when the map tiles cannot be read. */
export async function substationsNear(lat: number, lon: number, withinKm = 25): Promise<Substation[]> {
  const kept = (g.__dhoopGrid ??= new Map());
  const centre = tileAt(lat, lon, ZOOM);
  const tiles: Promise<Substation[]>[] = [];
  // The tile the spot is in and the eight round it: about twenty kilometres each way.
  for (const dx of [-1, 0, 1]) {
    for (const dy of [-1, 0, 1]) {
      const key = `${centre.x + dx}/${centre.y + dy}`;
      let tile = kept.get(key);
      if (!tile) {
        tile = loadTile(centre.x + dx, centre.y + dy).catch((error) => {
          kept.delete(key);
          throw error;
        });
        kept.set(key, tile);
        if (kept.size > 60) kept.delete(kept.keys().next().value as string);
      }
      tiles.push(tile);
    }
  }
  const seen = new Set<string>();
  return (await Promise.all(tiles))
    .flat()
    .map((s) => ({ ...s, km: Math.round(Math.hypot((s.lat - lat) * 111.13, (s.lon - lon) * 111.32 * Math.cos((lat * Math.PI) / 180)) * 10) / 10 }))
    .filter((s) => {
      // The same substation can sit in two tiles' margins.
      const key = `${s.lat.toFixed(4)},${s.lon.toFixed(4)}`;
      if (s.km > withinKm || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.km - b.km);
}
