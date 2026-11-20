/**
 * How closely the satellite picture can be shown at a given spot.
 *
 * The imagery service (Esri World Imagery) has pictures down to zoom level 19 in big cities,
 * but smaller towns stop at 17 or 18. Asking for a level it does not have returns grey tiles
 * that say "Map data not yet available". The service publishes a tile map that says which
 * tiles exist, so the map asks first and enlarges the deepest real picture instead.
 *
 * Safe to import from a screen: it uses nothing but fetch.
 */

export const IMAGERY_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const IMAGERY_TILE_MAP = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tilemap';

/** The sharpest level the service offers anywhere. */
export const SHARPEST_ZOOM = 19;
/** Pictures exist almost everywhere at this level. Used when the service cannot be asked. */
export const SAFE_ZOOM = 17;
const SHALLOWEST_ZOOM = 13;

/** The map tile that holds a spot at a zoom level (the usual web-map tiling). */
export function tileAt(lat: number, lon: number, zoom: number): { x: number; y: number } {
  const n = 2 ** zoom;
  const rad = (Math.min(Math.max(lat, -85), 85) * Math.PI) / 180;
  const x = Math.floor(((lon + 180) / 360) * n);
  const y = Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n);
  return { x: Math.min(Math.max(x, 0), n - 1), y: Math.min(Math.max(y, 0), n - 1) };
}

const known = new Map<string, number>();

/**
 * The deepest zoom level at which the service has a real picture of this spot.
 * `ask` is the fetch to use; tests pass their own.
 */
export async function deepestImagery(lat: number, lon: number, ask: typeof fetch = fetch): Promise<number> {
  // Neighbouring spots share an answer, so remember it per small area.
  const area = tileAt(lat, lon, 16);
  const key = `${area.x},${area.y}`;
  const remembered = known.get(key);
  if (remembered !== undefined) return remembered;

  for (let zoom = SHARPEST_ZOOM; zoom > SHALLOWEST_ZOOM; zoom--) {
    const { x, y } = tileAt(lat, lon, zoom);
    try {
      const res = await ask(`${IMAGERY_TILE_MAP}/${zoom}/${y}/${x}/1/1`);
      const body = (await res.json()) as { data?: number[] };
      if (body.data?.[0] === 1) {
        known.set(key, zoom);
        return zoom;
      }
    } catch {
      // The service could not be asked. Do not remember this: it may answer next time.
      return SAFE_ZOOM;
    }
  }
  known.set(key, SHALLOWEST_ZOOM);
  return SHALLOWEST_ZOOM;
}

/** One picture of the map: its zoom level and its place in that level's grid. */
export type Tile = { z: number; x: number; y: number };

/**
 * The tiles a straight dive down to a spot passes through. For every zoom level on the way,
 * these are the tiles around the spot that a view of `size` pixels shows as that level comes up.
 * Plain arithmetic, so a test can count them.
 */
export function diveTiles(lat: number, lon: number, fromZoom: number, toZoom: number, size: { x: number; y: number }): Tile[] {
  const rad = (Math.min(Math.max(lat, -85), 85) * Math.PI) / 180;
  // Half the view, in tiles. The outer edge of a level may come up a moment late; the middle, where the eye is, does not.
  const halfX = size.x / 2 / 256;
  const halfY = size.y / 2 / 256;
  const tiles: Tile[] = [];
  for (let z = fromZoom + 1; z <= toZoom; z++) {
    const n = 2 ** z;
    const midX = ((lon + 180) / 360) * n;
    const midY = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
    for (let y = Math.floor(midY - halfY); y <= Math.floor(midY + halfY); y++) {
      for (let x = Math.floor(midX - halfX); x <= Math.floor(midX + halfX); x++) {
        if (x >= 0 && y >= 0 && x < n && y < n) tiles.push({ z, x, y });
      }
    }
  }
  return tiles;
}

/** Pictures fetched ahead of a dive, kept until it is over so the browser has them to hand. */
let warmed: unknown[] = [];

/**
 * Fetch the pictures a dive will pass through before it starts. A map only asks for a level
 * when it gets there, and on the way down each level is on screen for a fraction of a second,
 * which is too short to fetch it: without this the dive is one enlarged blur until it stops.
 * Resolves when the pictures have arrived or failed, or after `waitMs`. Never rejects.
 */
export function warmDive(lat: number, lon: number, fromZoom: number, toZoom: number, size: { x: number; y: number }, waitMs = 2500): Promise<void> {
  if (typeof Image === 'undefined') return Promise.resolve();
  const wanted = diveTiles(lat, lon, fromZoom, toZoom, size);
  return new Promise((done) => {
    let left = wanted.length;
    if (left === 0) return done();
    const arrived = () => {
      if (--left <= 0) done();
    };
    const held = wanted.map(({ z, x, y }) => {
      const picture = new Image();
      picture.onload = arrived;
      picture.onerror = arrived;
      picture.src = IMAGERY_TILES.replace('{z}', String(z)).replace('{y}', String(y)).replace('{x}', String(x));
      return picture;
    });
    warmed = held;
    setTimeout(done, waitMs);
    setTimeout(() => {
      if (warmed === held) warmed = [];
    }, waitMs + 15_000);
  });
}

/** Forget remembered answers. For tests. */
export function forgetImagery() {
  known.clear();
}
