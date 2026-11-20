import { ASSUMPTIONS } from './config';

/** Places and sunshine. Network calls here are best-effort with safe fallbacks. */

export interface Place {
  label: string;
  lat: number;
  lon: number;
}

/** Cities offered in the tap-only hall version, and used when geocoding is unavailable. */
export const CITIES: Place[] = [
  { label: 'Bengaluru', lat: 12.97, lon: 77.59 },
  { label: 'Mysuru', lat: 12.3, lon: 76.64 },
  { label: 'Mangaluru', lat: 12.91, lon: 74.86 },
  { label: 'Hubballi', lat: 15.36, lon: 75.12 },
  { label: 'Belagavi', lat: 15.85, lon: 74.5 },
  { label: 'Tumakuru', lat: 13.34, lon: 77.1 },
  { label: 'Chennai', lat: 13.08, lon: 80.27 },
  { label: 'Coimbatore', lat: 11.02, lon: 76.96 },
  { label: 'Madurai', lat: 9.93, lon: 78.12 },
  { label: 'Hyderabad', lat: 17.39, lon: 78.49 },
  { label: 'Visakhapatnam', lat: 17.69, lon: 83.22 },
  { label: 'Vijayawada', lat: 16.51, lon: 80.65 },
  { label: 'Kochi', lat: 9.93, lon: 76.27 },
  { label: 'Thiruvananthapuram', lat: 8.52, lon: 76.94 },
  { label: 'Kozhikode', lat: 11.26, lon: 75.78 },
  { label: 'Mumbai', lat: 19.08, lon: 72.88 },
  { label: 'Pune', lat: 18.52, lon: 73.86 },
  { label: 'Nagpur', lat: 21.15, lon: 79.09 },
  { label: 'Nashik', lat: 20.0, lon: 73.79 },
  { label: 'Ahmedabad', lat: 23.02, lon: 72.57 },
  { label: 'Surat', lat: 21.17, lon: 72.83 },
  { label: 'Vadodara', lat: 22.31, lon: 73.18 },
  { label: 'Jaipur', lat: 26.91, lon: 75.79 },
  { label: 'Jodhpur', lat: 26.24, lon: 73.02 },
  { label: 'Udaipur', lat: 24.59, lon: 73.71 },
  { label: 'Delhi', lat: 28.61, lon: 77.21 },
  { label: 'Gurugram', lat: 28.46, lon: 77.03 },
  { label: 'Noida', lat: 28.54, lon: 77.39 },
  { label: 'Chandigarh', lat: 30.73, lon: 76.78 },
  { label: 'Ludhiana', lat: 30.9, lon: 75.85 },
  { label: 'Amritsar', lat: 31.63, lon: 74.87 },
  { label: 'Lucknow', lat: 26.85, lon: 80.95 },
  { label: 'Kanpur', lat: 26.45, lon: 80.33 },
  { label: 'Varanasi', lat: 25.32, lon: 82.97 },
  { label: 'Patna', lat: 25.59, lon: 85.14 },
  { label: 'Ranchi', lat: 23.34, lon: 85.31 },
  { label: 'Kolkata', lat: 22.57, lon: 88.36 },
  { label: 'Bhubaneswar', lat: 20.3, lon: 85.82 },
  { label: 'Guwahati', lat: 26.14, lon: 91.74 },
  { label: 'Bhopal', lat: 23.26, lon: 77.41 },
  { label: 'Indore', lat: 22.72, lon: 75.86 },
  { label: 'Raipur', lat: 21.25, lon: 81.63 },
  { label: 'Dehradun', lat: 30.32, lon: 78.03 },
  { label: 'Srinagar', lat: 34.08, lon: 74.8 },
  { label: 'Panaji', lat: 15.49, lon: 73.83 },
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

/** Old and alternate names people actually say. */
const ALIASES: Record<string, string> = {
  bangalore: 'Bengaluru',
  mysore: 'Mysuru',
  mangalore: 'Mangaluru',
  hubli: 'Hubballi',
  belgaum: 'Belagavi',
  tumkur: 'Tumakuru',
  madras: 'Chennai',
  // How Tamil says them: the recogniser hears the Tamil name, and the agent spells it as it sounds.
  kovai: 'Coimbatore',
  koyambuthur: 'Coimbatore',
  koyamputhur: 'Coimbatore',
  koyambuttur: 'Coimbatore',
  koyamputtur: 'Coimbatore',
  bezawada: 'Vijayawada',
  cochin: 'Kochi',
  trivandrum: 'Thiruvananthapuram',
  calicut: 'Kozhikode',
  bombay: 'Mumbai',
  baroda: 'Vadodara',
  newdelhi: 'Delhi',
  gurgaon: 'Gurugram',
  calcutta: 'Kolkata',
  vizag: 'Visakhapatnam',
  goa: 'Panaji',
};

export function findCity(query: string): Place | undefined {
  const q = norm(query);
  if (!q) return undefined;
  const alias = Object.keys(ALIASES).find((a) => q.includes(a));
  const name = alias ? ALIASES[alias] : undefined;
  return CITIES.find((c) => (name ? c.label === name : q.includes(norm(c.label)) || norm(c.label).includes(q)));
}

async function fetchJson(url: string, ms: number, headers?: Record<string, string>): Promise<unknown> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers, cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Of the places a lookup returns, the one a person most likely means. A bare town name often
 * matches its district first, and a district's centre can be 25 km from the town ("udupi" did
 * exactly that). So a town, a neighbourhood or a building wins over a district or a state.
 * OpenStreetMap ranks places from 4 (a country) to 30 (a building); a city is 16.
 */
export function likeliestPlace<T extends { place_rank?: number }>(hits: T[]): T | undefined {
  return hits.find((h) => (h.place_rank ?? 30) >= 16) ?? hits[0];
}

/**
 * Turn a spoken or typed place into coordinates.
 *
 * A bare city name from the bundled list is answered at once, with no network. Anything
 * longer, such as a landmark with its city, is looked up on OpenStreetMap: answering
 * "Indiranagar Metro Station, Bengaluru" with the centre of Bengaluru would be no help to
 * someone looking for their roof. `near` makes nearby matches come first when the home's
 * city is already known. The bundled city, if one was named, is the fallback.
 */
export async function geocode(query: string, near?: { lat: number; lon: number }): Promise<Place | undefined> {
  const city = findCity(query);
  if (city && norm(query) === norm(city.label)) return city;
  try {
    const home = near && Number.isFinite(near.lat) && Number.isFinite(near.lon) ? near : undefined;
    const ask = async (nearHomeOnly: boolean) => {
      const params = new URLSearchParams({ format: 'jsonv2', limit: '5', countrycodes: 'in', q: query });
      if (home && nearHomeOnly) {
        // About 65 km each way around the home.
        const d = 0.6;
        params.set('viewbox', `${home.lon - d},${home.lat + d},${home.lon + d},${home.lat - d}`);
        params.set('bounded', '1');
      }
      try {
        const hits = (await fetchJson(`https://nominatim.openstreetmap.org/search?${params}`, 6000, { 'User-Agent': 'dhoop-solar-demo' })) as {
          lat: string;
          lon: string;
          display_name: string;
          place_rank?: number;
        }[];
        return Array.isArray(hits) ? likeliestPlace(hits) : undefined;
      } catch {
        // One failed question must not sink the other.
        return undefined;
      }
    };
    // Around the home first, when it is known: "the temple" means the one down the road, not
    // the best-known one in the country. Then anywhere in India.
    let hit = home ? await ask(true) : undefined;
    if (!hit) {
      // The lookup service asks for no more than one question a second.
      if (home) await new Promise((resolve) => setTimeout(resolve, 1100));
      hit = await ask(false);
    }
    if (hit) {
      const label = hit.display_name
        .split(',')
        .slice(0, 2)
        .map((part) => part.trim())
        .join(', ');
      return { label, lat: Number(hit.lat), lon: Number(hit.lon) };
    }
  } catch {
    /* fall through to the bundled city, if one was named */
  }
  return city;
}

/** One match from a place lookup, in terms both lookup services can give. */
export interface PlaceHit {
  name: string;
  /** The town or city it is in, when the service says. */
  town: string;
  lat: number;
  lon: number;
  /** OpenStreetMap's rank: 30 is a building or a named spot, 26 a street, 24 a campus or a neighbourhood, 16 a city. */
  rank: number;
  /** Half the distance across the match, in metres: next to nothing for a point, hundreds for a campus. */
  halfSpanM: number;
  /** What kind of thing it is, as "class/type": "office/government", "highway/bus_stop". */
  kind: string;
  /** The building's own outline as [lat, lon] corners, when the map holds the place as a building. */
  ring?: [number, number][];
}

/** A named place found on the map, with how exact the match is. */
export interface NamedPlace extends Place {
  rank: number;
  halfSpanM: number;
  /** True when the map has no place of that name and the match is something at its address, such as a shop inside a mall. */
  byAddress: boolean;
  /** The building's own outline, when the map holds the place as a building. Better than any guess at which building is meant. */
  ring?: [number, number][];
}

const nameWords = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4);

/**
 * Whether what the map found carries the name that was asked for, give or take spelling.
 * The forgiving lookup also matches on addresses: asked for a mall the map does not name, it
 * answers with a shoe shop inside it. That is the right building under the wrong name.
 */
export function sameName(asked: string, found: string): boolean {
  const want = nameWords(asked);
  if (!want.length) return true;
  const got = nameWords(found);
  return want.some((w) => got.some((g) => g.startsWith(w.slice(0, 5)) || w.startsWith(g.slice(0, 5))));
}

const halfSpan = (south: number, north: number, west: number, east: number, lat: number) =>
  Math.round(Math.hypot((north - south) * 111_320, (east - west) * 111_320 * Math.cos((lat * Math.PI) / 180)) / 2);

/**
 * Of the matches for a building's name, the one a person means. Bus stops, stations and roads
 * carry the names of the buildings they serve and often come first: "Lulu Mall, Kochi" was
 * answered with a bus stop in another city. So they lose to anything else. After that the
 * lookup service's own order stands, with the same rule as for a town: no district or state
 * when there is something smaller.
 */
export function pickNamed(hits: PlaceHit[]): PlaceHit | undefined {
  const places = hits.filter((h) => !/^(highway|railway|public_transport)\//.test(h.kind));
  const pool = places.length ? places : hits;
  const first = pool.find((h) => h.rank >= 16) ?? pool[0];
  if (!first || first.ring) return first;
  // The grounds of a palace come before the palace. When a building of the same name stands
  // within them, that building is what was asked for.
  const building = pool.find((h) => h.ring && sameName(first.name, h.name) && Math.hypot(h.lat - first.lat, h.lon - first.lon) < 0.01);
  return building ?? first;
}

/** The outer edge of a shape the lookup service drew, as [lat, lon] corners without the repeated last one. */
function outerRing(shape: { type?: string; coordinates?: unknown } | undefined): [number, number][] | undefined {
  const rings: number[][][] =
    shape?.type === 'Polygon' ? [(shape.coordinates as number[][][])[0]] : shape?.type === 'MultiPolygon' ? (shape.coordinates as number[][][][]).map((p) => p[0]) : [];
  // Of several pieces, the one with the most corners is the main one.
  const main = rings.filter((r) => Array.isArray(r) && r.length >= 4).sort((a, b) => b.length - a.length)[0];
  return main?.slice(0, -1).map(([lon, lat]) => [lat, lon] as [number, number]);
}

/** India, as west, south, east, north. */
const INDIA_BOX = '68.1,6.5,97.4,35.7';
/** The second lookup service names kinds of place in words. These are the ranks they stand for. */
const RANK_OF: Record<string, number> = { house: 30, street: 26, locality: 24, district: 20, city: 16, county: 12, state: 8 };

/**
 * Find a building or a landmark by its name, anywhere in India.
 *
 * Two free lookup services over the same OpenStreetMap data are asked in turn. The first
 * (Nominatim) orders its answers well but wants the name spelt as the map has it. The second
 * (Photon) forgives spelling, which matters for names that have come through speech
 * recognition: "Vidhan Soudha" finds Vidhana Soudha only there. `near` makes matches around
 * the home come first when the person leaves out the city. It is a preference, not a fence.
 *
 * Both are asked at once, because the first is sometimes slow and a voice conversation cannot
 * hold its breath: its answer is waited for a short while, then the second one's is taken.
 */
/**
 * Places people call by one name and the map files under another. The hackathon's own venue is
 * the reason this exists: "Polaris School of Technology" found a college forty kilometres away,
 * and "DivyaSree Technopark" a different campus of the same developer, because the map spells
 * the campus "Divyashree". The name on the right is the one the map answers to.
 */
const SAID_AS: [RegExp, string][] = [[/polaris school of tech|divya ?s(h)?r(ee|i) ?techno ?park/i, 'Divyashree Technopark, Bengaluru']];

/** The name to look a place up by: the map's own, where the spoken one is known to miss. */
export function mapNameFor(query: string): string {
  return SAID_AS.find(([said]) => said.test(query))?.[1] ?? query;
}

export async function namedPlace(spoken: string, near?: { lat: number; lon: number }): Promise<NamedPlace | undefined> {
  const query = mapNameFor(spoken);
  const home = near && Number.isFinite(near.lat) && Number.isFinite(near.lon) ? near : undefined;
  const headers = { 'User-Agent': 'dhoop-solar-demo' };
  const key = `${query.trim().toLowerCase()}|${home ? `${home.lat.toFixed(1)},${home.lon.toFixed(1)}` : ''}`;
  const remembered = namedPlaces.get(key);
  if (remembered) return remembered;

  const spelt = async (): Promise<PlaceHit[]> => {
    const params = new URLSearchParams({ format: 'jsonv2', limit: '5', countrycodes: 'in', addressdetails: '1', extratags: '1', polygon_geojson: '1', 'accept-language': 'en', q: query });
    if (home) params.set('viewbox', `${home.lon - 0.6},${home.lat + 0.6},${home.lon + 0.6},${home.lat - 0.6}`);
    const hits = (await fetchJson(`https://nominatim.openstreetmap.org/search?${params}`, 6000, headers)) as {
      lat: string;
      lon: string;
      name?: string;
      display_name: string;
      place_rank?: number;
      category?: string;
      type?: string;
      boundingbox?: string[];
      address?: Record<string, string>;
      extratags?: Record<string, string> | null;
      geojson?: { type?: string; coordinates?: unknown };
    }[];
    return (Array.isArray(hits) ? hits : []).map((h) => {
      const lat = Number(h.lat);
      const [south, north, west, east] = (h.boundingbox ?? []).map(Number);
      const a = h.address ?? {};
      // The shape is the building itself only when the map says the thing is a building. A campus or a park has a shape too.
      const isBuilding = h.category === 'building' || (!!h.extratags?.building && h.extratags.building !== 'no');
      return {
        ring: isBuilding ? outerRing(h.geojson) : undefined,
        name: h.name || h.display_name.split(',')[0].trim(),
        town: a.city || a.town || a.village || a.municipality || a.county || a.state_district || '',
        lat,
        lon: Number(h.lon),
        rank: h.place_rank ?? 30,
        halfSpanM: Number.isFinite(east) ? halfSpan(south, north, west, east, lat) : 0,
        kind: `${h.category ?? ''}/${h.type ?? ''}`,
      };
    });
  };

  const forgiving = async (): Promise<PlaceHit[]> => {
    const params = new URLSearchParams({ q: query, limit: '5', lang: 'en', bbox: INDIA_BOX });
    if (home) {
      params.set('lat', String(home.lat));
      params.set('lon', String(home.lon));
    }
    const data = (await fetchJson(`https://photon.komoot.io/api/?${params}`, 6000, headers)) as {
      features?: { geometry: { coordinates: [number, number] }; properties: Record<string, string | undefined> & { extent?: number[] } }[];
    };
    return (data.features ?? [])
      .filter((f) => f.properties.countrycode === 'IN' && f.properties.name)
      .map((f) => {
        const p = f.properties;
        const [lon, lat] = f.geometry.coordinates;
        // This service gives the corners as west, north, east, south.
        const e = p.extent;
        return {
          name: p.name as string,
          town: p.city || p.county || p.state || '',
          lat,
          lon,
          rank: RANK_OF[p.type ?? ''] ?? 24,
          halfSpanM: e && e.length === 4 ? halfSpan(e[3], e[1], e[0], e[2], lat) : 0,
          kind: `${p.osm_key ?? ''}/${p.osm_value ?? ''}`,
        };
      });
  };

  // A service that cannot be asked counts as having found nothing.
  const quietly = (ask: () => Promise<PlaceHit[]>) =>
    ask()
      .then((hits) => pickNamed(hits.filter((h) => Number.isFinite(h.lat) && Number.isFinite(h.lon))))
      .catch(() => undefined);
  const careful = quietly(spelt);
  const loose = quietly(forgiving);
  const inTime = await Promise.race([careful, new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), NAMED_WAIT_MS))]);
  // The careful answer if it came in time; else the forgiving one; else the careful one however late.
  const hit = inTime ?? (await loose) ?? (await careful);
  if (!hit) return undefined;

  // Matched through its address: keep the name the person used, which is what they will look for on screen.
  const asked = query.split(',')[0].trim();
  const byAddress = !sameName(asked, hit.name);
  const name = byAddress ? asked : hit.name;
  const label = hit.town && !norm(name).includes(norm(hit.town)) ? `${name}, ${hit.town}` : name;
  const place: NamedPlace = { label, lat: hit.lat, lon: hit.lon, rank: hit.rank, halfSpanM: hit.halfSpanM, byAddress, ring: hit.ring };
  namedPlaces.set(key, place);
  if (namedPlaces.size > 100) namedPlaces.delete(namedPlaces.keys().next().value as string);
  return place;
}

/** How long the careful lookup is waited for before the forgiving one's answer is taken instead. */
const NAMED_WAIT_MS = 2500;
/** Names looked up lately. The same landmark is asked for again and again in a demo, and the services ask to be spared. */
const namedPlaces = new Map<string, NamedPlace>();

/**
 * A short name for a spot on the map, such as "Brookefield, Bengaluru". Used when the home is
 * found from the device's location and nobody has said what the place is called.
 */
export async function placeAt(lat: number, lon: number): Promise<Place> {
  // Spots within about a hundred metres share a name, and the lookup service is asked less.
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  const known = placeNames.get(key);
  if (known) return { label: known, lat, lon };
  for (let attempt = 0; attempt < 2; attempt++) {
    // The lookup service asks for no more than one question a second, and refuses now and then.
    if (attempt) await new Promise((resolve) => setTimeout(resolve, 1200));
    try {
      const data = (await fetchJson(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=16&lat=${lat}&lon=${lon}`, 6000, { 'User-Agent': 'dhoop-solar-demo' })) as {
        address?: Record<string, string>;
      };
      const a = data.address ?? {};
      const small = a.suburb || a.neighbourhood || a.village || a.city_district || a.town || '';
      const big = a.city || a.town || a.county || a.state_district || a.state || '';
      const label = [small, big].filter((part, i, all) => part && all.indexOf(part) === i).join(', ');
      if (label) {
        placeNames.set(key, label);
        if (placeNames.size > 200) placeNames.delete(placeNames.keys().next().value as string);
        return { label, lat, lon };
      }
    } catch {
      /* try once more, then fall through */
    }
  }
  // No name to be had. A bundled city counts only when the spot is really in or beside it:
  // "near Mangaluru" for a home in Udupi, 55 km away, would be wrong.
  const nearest = CITIES.map((c) => ({ c, km: Math.hypot((c.lat - lat) * 111, (c.lon - lon) * 111 * Math.cos((lat * Math.PI) / 180)) })).sort((x, y) => x.km - y.km)[0];
  return { label: nearest && nearest.km < 20 ? nearest.c.label : VAGUE_PLACE, lat, lon };
}

/** What a spot is called when its name could not be looked up. */
export const VAGUE_PLACE = 'your location';
const placeNames = new Map<string, string>();

export interface Sunshine {
  /** Average peak sun hours per day over the year. */
  annual: number;
  /** Twelve monthly averages, January first. Empty when the default was used. */
  monthly: number[];
  source: 'nasa' | 'default';
}

const sunCache = new Map<string, Sunshine>();
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** Long-term average sunshine from NASA POWER (free, no key). Falls back to a national ballpark. */
export async function sunshine(lat: number, lon: number): Promise<Sunshine> {
  const key = `${lat.toFixed(1)},${lon.toFixed(1)}`;
  const hit = sunCache.get(key);
  if (hit) return hit;
  try {
    const url = `https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=ALLSKY_SFC_SW_DWN&community=RE&longitude=${lon.toFixed(2)}&latitude=${lat.toFixed(2)}&format=JSON`;
    const data = (await fetchJson(url, 8000)) as { properties?: { parameter?: { ALLSKY_SFC_SW_DWN?: Record<string, number> } } };
    const p = data?.properties?.parameter?.ALLSKY_SFC_SW_DWN;
    if (p && typeof p.ANN === 'number' && p.ANN > 1 && p.ANN < 9) {
      const out: Sunshine = { annual: Math.round(p.ANN * 100) / 100, monthly: MONTHS.map((m) => p[m]), source: 'nasa' };
      sunCache.set(key, out);
      return out;
    }
  } catch {
    /* fall through */
  }
  return { annual: ASSUMPTIONS.defaultSunHours, monthly: [], source: 'default' };
}
