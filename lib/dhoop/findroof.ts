import { buildingsNear, chooseNamedBuilding, wholeBuilding, type Building } from './buildings';
import { SQFT_PER_M2 } from './config';
import { namedPlace, placeAt, sunshine, VAGUE_PLACE } from './places';
import { polygonAreaM2, roofCapacity } from './solar';
import { ensureSession, updateSession } from './store';

/**
 * Finding a roof without making anyone draw it.
 *
 * Given a spot (the device's location, a tap on the satellite view, or a building the person
 * named), this picks the building there from open building outlines, measures it, and saves
 * it to the session as the roof. It also names the place and looks up its sunshine when that
 * is not known yet, so the agent need not ask for the city. The agent's findMyRoof and
 * findBuilding tools and the screen all use it.
 */

/** Part of a flat roof is taken by tanks, stairs and walls. The same starting share the satellite view uses. */
export const DEFAULT_SHADE = 0.1;

/** How far from the spot a building may be and still be "the one here". */
export function searchRadiusM(how: 'device' | 'tap', accuracyM?: number): number {
  // A tap points at the building. A device's location is only as good as it says it is.
  if (how === 'tap') return 15;
  return Math.min(Math.max(accuracyM ?? 30, 20), 60);
}

/** Beyond this the device only knows its neighbourhood, and "the nearest building" would be a guess. */
export const TOO_ROUGH_M = 150;

/**
 * How far from the middle of a named place its building may be, and whether that building is
 * surely the one meant. Null for a suburb or a town, where any one building would be a guess.
 * `rank` is OpenStreetMap's (30 a building or a named spot, 24 a campus, 19 a suburb) and
 * `halfSpanM` is half the distance across what the name matched.
 */
export function namedReach(place: { rank: number; halfSpanM: number }): { withinM: number; exact: boolean } | null {
  // A building or a named spot. Its outline holds the spot or stands right beside it.
  if (place.rank >= 28 && place.halfSpanM <= 250) return { withinM: Math.min(Math.max(place.halfSpanM, 40), 120), exact: true };
  // A campus, a tech park, a street. Something stands near its middle, but perhaps not the building meant.
  if (place.rank >= 22 && place.halfSpanM <= 1500) return { withinM: 150, exact: false };
  return null;
}

/** A building the map names and outlines itself is believed between these sizes, in square metres: a shrine to an airport terminal. */
const OWN_OUTLINE_M2 = { least: 10, most: 200_000 };

type Spot = { lat: number; lon: number };

/** Metres between two spots. Flat-earth maths, good at the scale of a town. */
export const metresBetween = (a: Spot, b: Spot) => Math.hypot((a.lat - b.lat) * 111_320, (a.lon - b.lon) * 111_320 * Math.cos((a.lat * Math.PI) / 180));
const km = (a: Spot, b: Spot) => metresBetween(a, b) / 1000;

/**
 * Whether a fresh report of the device's location should move the home.
 * The first report of a call always counts: the person ticked the box and pressed start, so
 * where they are now wins over anything left from an earlier call. After that the home follows
 * the device only while nobody has named a place or picked a building by hand, and only when
 * it has really moved, not for every flicker of the reading.
 */
export function shouldFollow(report: { first: boolean; following: boolean; movedM: number }): boolean {
  return report.first || (report.following && report.movedM > 25);
}

export async function findRoofAt(
  sid: string,
  spot: {
    lat: number;
    lon: number;
    accuracyM?: number;
    /** For a named place: what it is called. */
    label?: string;
    /** For a named place: how far from the spot its building may be. Left out for an area, where no building is picked. */
    withinM?: number;
    /** For a named place: its own outline, when the map holds it as a building. Then nothing has to be picked. */
    ring?: [number, number][];
    /** For a named place: true when the map marks it as a single point, not as a shape with a middle. */
    point?: boolean;
    /** For a named place: false when the building outlined may not be the one meant. The name covers several, or was matched through its address. */
    exact?: boolean;
  },
  how: 'device' | 'tap' | 'named',
): Promise<Record<string, unknown>> {
  const session = ensureSession(sid);
  const named = how === 'named';
  // A device that knows only its neighbourhood can place the home, but not pick the building.
  const rough = how === 'device' && (spot.accuracyM ?? 30) > TOO_ROUGH_M;
  // Nor can a name that stands for a whole suburb or town.
  const area = named && !spot.withinM && !spot.ring;

  let building: Building | undefined;
  try {
    if (named && spot.ring) building = { ring: spot.ring, source: 'osm', areaM2: polygonAreaM2(spot.ring), distanceM: 0 };
    else if (named && spot.withinM) building = chooseNamedBuilding(await buildingsNear(spot.lat, spot.lon, spot.withinM), spot.withinM, !!spot.point);
    else if (!rough && !area) {
      const near = await buildingsNear(spot.lat, spot.lon, searchRadiusM(how === 'tap' ? 'tap' : 'device', spot.accuracyM));
      // A tap points at one outline and gets it. A device only knows roughly where it stands, so a
      // scrap of roof drawn apart from its building gives way to the building.
      building = near[0] && how === 'device' ? wholeBuilding(near[0], near) : near[0];
    }
  } catch (error) {
    console.warn('Building lookup failed:', error instanceof Error ? error.message.slice(0, 120) : error);
    return { ok: false, found: false, error: 'The building data could not be reached.', next: 'Ask the person to tap the corners of their roof on the satellite view, or to tell you the roof size.' };
  }

  // Name the place and fetch its sunshine when the home is not placed yet, or was placed elsewhere.
  let placeLabel = spot.label ?? session.location?.label;
  if (!session.location || km(session.location, spot) > 15) {
    const [place, sun] = await Promise.all([spot.label ? { label: spot.label } : placeAt(spot.lat, spot.lon), sunshine(spot.lat, spot.lon)]);
    placeLabel = place.label;
    updateSession(
      sid,
      (s) => {
        // A roof marked on the map and a design made for it belong to the old place.
        if (s.location && (s.roof?.source === 'found' || s.roof?.source === 'satellite')) s.roof = s.design = s.compare = undefined;
        s.location = { label: place.label, lat: spot.lat, lon: spot.lon, sunHours: sun.annual, monthly: sun.monthly, source: sun.source };
      },
      { kind: 'setLocation', text: `Sunshine at ${place.label}: ${sun.annual} peak hours a day (${sun.source === 'nasa' ? 'NASA data' : 'national average'})` },
    );
  } else {
    // Same town: keep its sunshine, but open the map on the exact spot. If the name could not
    // be looked up last time, try again now.
    const better = spot.label ?? (session.location.label === VAGUE_PLACE ? (await placeAt(spot.lat, spot.lon)).label : session.location.label);
    placeLabel = better;
    updateSession(sid, (s) => {
      if (s.location) Object.assign(s.location, { lat: spot.lat, lon: spot.lon, label: better });
    });
  }
  if (named) {
    // Another building was asked for by name. A roof marked on the map, and any system sized
    // so far, belong to the building before it.
    updateSession(sid, (s) => {
      if (s.roof?.source === 'found' || s.roof?.source === 'satellite') s.roof = undefined;
      s.design = s.compare = undefined;
    });
  }

  if (!building) {
    updateSession(sid, (s) => {
      s.view = 'roof';
    });
    return {
      ok: false,
      found: false,
      place: placeLabel,
      ...(rough ? { location_is_only_rough_within_metres: Math.round(spot.accuracyM ?? 0) } : {}),
      next: rough
        ? 'This device knows only roughly where it is, so the building cannot be picked out. Tell the person the area you see, and ask them to tap their building on the satellite view on screen, then call getRoofSurvey.'
        : area
          ? 'That name is an area, not one building, and the screen now shows it. Say so. Ask for the name of the building, or of a landmark beside it, and call findBuilding again; or ask the person to tap the building on the screen and then call getRoofSurvey.'
          : named
            ? 'The place is on the map, but no building is mapped right there. The screen now shows it. Say so, and ask the person to tap the building on the screen, then call getRoofSurvey.'
            : 'No building is mapped at that spot. Ask the person to tap their building on the satellite view on screen, or to tell you the roof size, then call getRoofSurvey or setRoofManual.',
    };
  }

  const cap = roofCapacity(building.areaM2, DEFAULT_SHADE);
  const sqft = Math.round(building.areaM2 * SQFT_PER_M2);
  const name = placeLabel && placeLabel !== VAGUE_PLACE ? placeLabel : undefined;
  const how_found = named ? `Building found by name, ${placeLabel}` : how === 'tap' ? 'Building picked on the satellite view' : "Building found from this device's location";
  updateSession(
    sid,
    (s) => {
      s.roof = { areaM2: building.areaM2, shadeFraction: DEFAULT_SHADE, usableM2: cap.usableM2, capacityKw: cap.kw, panelsFit: cap.panels, source: 'found', foundBy: how, name, polygon: building.ring };
      s.view = 'roof';
    },
    { kind: named ? 'findBuilding' : 'findMyRoof', text: `${how_found}: ${sqft.toLocaleString('en-IN')} sq ft, room for ${cap.panels} panels` },
  );

  const loose = named && spot.exact === false;
  return {
    ok: true,
    found: true,
    place: placeLabel,
    roof_area_sqft: sqft,
    usable_area_sqft: Math.round(cap.usableM2 * SQFT_PER_M2),
    panels_that_fit: cap.panels,
    largest_system_kw: cap.kw,
    ...(how === 'device' ? { location_may_be_off_by_metres: Math.round(spot.accuracyM ?? 30) } : {}),
    ...(loose ? { the_match_is_not_exact: true } : {}),
    caution: 'The outline comes from satellite data and is a pre-survey estimate. An installer confirms it on site.',
    next:
      how === 'device'
        ? 'Tell the person the place and the roof size you found, and ask whether the building outlined on the screen is theirs. If it is not, ask them to tap the right building on the screen, then call getRoofSurvey. When they agree, call designSolar with target_kw 0.'
        : loose
          ? 'The match is not exact: the name covers several buildings, or the map knows it only by its address. The screen outlines the building nearest the spot. Tell the person the roof size and how many panels fit on that one, and ask them to tap another building on the screen if they meant a different one; then call getRoofSurvey.'
          : named
            ? 'Tell the person you found it, how big the roof is and how many panels fit, and that it is outlined on the screen. To work out the saving for this building you need its own monthly electricity bill: a bill saved earlier belongs to another building. If they want that, ask for it, call saveBill, then designSolar with target_kw 0.'
            : 'Call designSolar with target_kw 0 to recommend a size.',
  };
}

/**
 * Find a building the person named, anywhere in India, and measure its roof.
 * When the building is not on the map under that name but its area is, the screen goes to
 * the area so the person can tap the building.
 */
export async function findNamedRoof(sid: string, query: string): Promise<Record<string, unknown>> {
  const session = ensureSession(sid);
  const home = session.location ? { lat: session.location.lat, lon: session.location.lon } : undefined;
  let place = await namedPlace(query, home);
  let areaOnly = false;
  if (!place && query.includes(',')) {
    // The lookup service asks for no more than one question a second.
    await new Promise((resolve) => setTimeout(resolve, 1100));
    place = await namedPlace(query.split(',').slice(1).join(',').trim(), home);
    areaOnly = !!place;
  }
  if (!place) {
    return {
      ok: false,
      found: false,
      looked_for: query,
      next: 'It is not on the map under that name. Say so, and ask for the area and the city it is in, or for a well-known landmark beside it. Then call findBuilding again.',
    };
  }
  // The map's own outline of the building is used when it has one of a believable size.
  const ownM2 = !areaOnly && place.ring && place.ring.length >= 3 ? polygonAreaM2(place.ring) : 0;
  const own = ownM2 >= OWN_OUTLINE_M2.least && ownM2 <= OWN_OUTLINE_M2.most ? place.ring : undefined;
  const reach = areaOnly || own ? null : namedReach(place);
  const result = await findRoofAt(
    sid,
    { lat: place.lat, lon: place.lon, label: place.label, ring: own, withinM: reach?.withinM, point: place.halfSpanM < 25, exact: (!!own || !!reach?.exact) && !place.byAddress },
    'named',
  );
  // The person named the place, so the device's location no longer moves the home.
  updateSession(sid, (s) => {
    s.followDevice = false;
  });
  return {
    looked_for: query,
    ...result,
    ...(areaOnly
      ? {
          the_building_itself_is_not_on_the_map: true,
          next: `The building is not on the map under that name, but its area is, and the screen now shows ${place.label}. Say so, and ask the person to tap the building on the screen. Then call getRoofSurvey.`,
        }
      : {}),
  };
}
