'use client';

import 'leaflet/dist/leaflet.css';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { Map as LeafletMap, LayerGroup, Polygon, TileLayer } from 'leaflet';
import { SQFT_PER_M2 } from '@/lib/dhoop/config';
import { deepestImagery, IMAGERY_TILES, SAFE_ZOOM, SHARPEST_ZOOM, warmDive } from '@/lib/dhoop/imagery';
import { layoutPanels } from '@/lib/dhoop/panels';
import { polygonAreaM2, roofCapacity, type Design } from '@/lib/dhoop/solar';
import { faultOf, locationHelp, type LocationFault } from '@/lib/dhoop/whereami';
import type { Roof, SiteSearch, Street } from '@/lib/dhoop/store';

/**
 * Your own roof from space.
 *
 * Dhoop finds the building by itself where it can: from this device's location, or from one
 * tap on the building. The outline comes from open building data and is saved to the session
 * as the roof. Where no building is mapped, the person taps the roof's corners instead.
 *
 * When a roof is known the view reveals it: the map starts high above the country and dives
 * straight down to the building, the outline traces itself, panels drop onto the roof one by
 * one and the numbers count up. All of it is drawn from the session: the same outline and the
 * same numbers the agent reads out.
 */

type Mode = 'pick' | 'draw';
/** Where the reveal has got to. 'done' also covers "nothing to reveal". */
type Reveal = 'fly' | 'trace' | 'panels' | 'done';

/** How far out the dive starts: most of the country is in view. */
const FAR_ZOOM = 5;
const FLY_SECONDS = 3.4;
const TRACE_MS = 1100;

const PANEL_ON = { color: '#fde68a', weight: 1.2, opacity: 1, fillColor: '#1d4ed8', fillOpacity: 0.92 };
const PANEL_ROOM = { color: '#bfdbfe', weight: 0.8, opacity: 0.55, fillColor: '#1d4ed8', fillOpacity: 0.22 };

/** How the roofs of the neighbourhood are drawn: as if each were covered in panels. */
const ROOF_LIT = { color: '#fde68a', weight: 1, opacity: 0.9, fillColor: '#1d4ed8', fillOpacity: 0.78 };

const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
/** Rupees short enough for the numbers over the map: lakhs and crores. */
const inrShort = (n: number) => (n >= 1e7 ? `₹${(n / 1e7).toFixed(1)} crore` : n >= 1e5 ? `₹${(n / 1e5).toFixed(1)} lakh` : inr(n));
const whole = (n: number) => Math.round(n).toLocaleString('en-IN');

/** A number that counts up to its value instead of appearing. It starts when `run` turns true. */
function Rolling({ value, run, format = whole }: { value: number; run: boolean; format?: (n: number) => string }) {
  const [shown, setShown] = useState(0);
  const at = useRef(0);
  useEffect(() => {
    if (!run) return;
    const from = at.current;
    const began = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - began) / 1400);
      at.current = from + (value - from) * (1 - Math.pow(1 - t, 3));
      setShown(at.current);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, run]);
  return <>{format(shown)}</>;
}

export default function SatelliteRoof({
  post,
  start,
  saved,
  found,
  device,
  roof,
  design,
  flyIn,
  street,
  loadStreet,
  site,
}: {
  post: (update: Record<string, unknown>) => Promise<unknown>;
  /** Where to open the map, if the home's location is already known. */
  start?: { lat: number; lon: number };
  /** The roof's corners already saved for this session. */
  saved?: [number, number][];
  /** True when Dhoop picked the saved outline out itself, rather than the person drawing it. */
  found?: boolean;
  /** Where the device says it is, with how far off it may be. Shown as a faint circle. */
  device?: { lat: number; lon: number; accuracyM: number };
  /** The measured roof that `saved` outlines. Its numbers are what the reveal counts up to. */
  roof?: Roof;
  /** The system Dhoop recommends, once it has one. Those panels light up among the ones that fit. */
  design?: Design;
  /** Open with the dive from high above the country. For the first roof Dhoop finds, not for corrections. */
  flyIn?: boolean;
  /** The neighbourhood added up around the home, once the person has asked for it. */
  street?: Street;
  /** Fetches the outlines of the neighbourhood's roofs, nearest the home first. */
  loadStreet?: () => Promise<[number, number][][] | null>;
  /** The place Dhoop found for a solar farm, when it has been asked for one. The view goes there. */
  site?: SiteSearch;
}) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const leafletRef = useRef<typeof import('leaflet') | null>(null);
  const tilesRef = useRef<TileLayer | null>(null);
  const outlineRef = useRef<LayerGroup | null>(null);
  const panelsRef = useRef<LayerGroup | null>(null);
  const deviceRef = useRef<LayerGroup | null>(null);
  const streetRef = useRef<LayerGroup | null>(null);
  const siteRef = useRef<LayerGroup | null>(null);
  const panelLayers = useRef<Polygon[]>([]);
  const builtFor = useRef<unknown>(null);
  const tracedFor = useRef<unknown>(null);

  const [points, setPoints] = useState<[number, number][]>(saved ?? []);
  const [mode, setMode] = useState<Mode>('pick');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(
    found
      ? roof?.foundBy === 'named'
        ? `Dhoop found ${roof.name ?? 'this building'} by its name. If it is not the building you meant, tap the right one.`
        : roof?.foundBy === 'voice'
          ? 'Dhoop redrew this roof as you asked. Say "undo that" to put it back.'
          : device && roof?.foundBy !== 'tap'
          ? `Dhoop outlined the building nearest this device, which may be up to about ${Math.round(device.accuracyM)} m from where it thinks it is. If it is not yours, tap the right one.`
          : 'Dhoop outlined this building. If it is not yours, tap the right one.'
      : device && device.accuracyM > 150
        ? `This device only knows where it is to within about ${Math.round(device.accuracyM)} m. Drag the map to your building and tap it.`
        : null,
  );
  const [shadePct, setShadePct] = useState(10);
  const [savedOnce, setSavedOnce] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const hasRoof = !!roof && !!saved && saved.length >= 3;
  const [reveal, setReveal] = useState<Reveal>(() => (hasRoof ? (flyIn ? 'fly' : 'trace') : 'done'));

  // The session is read again every second, which hands over a new array each time. The text
  // of the corners is what tells a new roof from the same one.
  const savedKey = saved ? JSON.stringify(saved) : '';
  const panelsFit = roof?.panelsFit ?? 0;
  /** Where the panels go, each as four corners. Only for a measured roof, never for one half drawn. */
  const shapes = useMemo(
    () => (savedKey && panelsFit > 0 ? layoutPanels(JSON.parse(savedKey) as [number, number][], panelsFit) : []),
    [savedKey, panelsFit],
  );

  /**
   * Make the picture match what the imagery service really has around a spot. Smaller towns
   * have no pictures at the closest levels, and asking for them shows grey tiles, so the
   * deepest real picture is enlarged instead. Returns that deepest level.
   */
  const matchImagery = async (lat: number, lon: number): Promise<number> => {
    const deepest = await deepestImagery(lat, lon);
    const tiles = tilesRef.current;
    if (tiles && tiles.options.maxNativeZoom !== deepest) {
      tiles.options.maxNativeZoom = deepest;
      tiles.redraw();
    }
    return deepest;
  };

  /** Move the map to a place, as close as still looks like a roof and not a blur. Returns the deepest level with a real picture. */
  const showPlace = async (lat: number, lon: number): Promise<number> => {
    const deepest = await matchImagery(lat, lon);
    mapRef.current?.setView([lat, lon], Math.min(SHARPEST_ZOOM, deepest + 1));
    return deepest;
  };

  /** Ask Dhoop to pick out the building at a spot the person tapped. */
  const pickAt = async (lat: number, lon: number) => {
    setBusy(true);
    setMessage('Looking for the building there…');
    const result = (await post({ type: 'roof_find', lat, lon }).catch(() => null)) as { found?: boolean; error?: string } | null;
    setBusy(false);
    // When a building is found the session changes and this view is redrawn around it.
    if (!result?.found) setMessage(result?.error ?? 'No building is mapped at that spot. Tap closer to the middle of the roof, or switch to drawing the corners.');
  };

  // The map is created once, so it reads the current mode and the current pickAt from here.
  const liveRef = useRef({ mode, pickAt });
  useEffect(() => {
    liveRef.current = { mode, pickAt };
  });

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    let settle: ReturnType<typeof setTimeout> | undefined;
    let takeOff: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || !elRef.current || mapRef.current) return;
      leafletRef.current = L;
      const flying = reveal === 'fly';
      const roofAt: [number, number] | null =
        saved && saved.length >= 3 ? [saved.reduce((sum, p) => sum + p[0], 0) / saved.length, saved.reduce((sum, p) => sum + p[1], 0) / saved.length] : null;
      const map = L.map(elRef.current, {
        // A dive starts high above the roof itself, so that it comes straight down.
        center: flying && roofAt ? roofAt : [start?.lat ?? 12.9716, start?.lon ?? 77.5946],
        zoom: flying ? FAR_ZOOM : SAFE_ZOOM,
        maxZoom: 21,
        zoomControl: true,
      });
      // Start at a level that has pictures almost everywhere; matchImagery then deepens it where it can.
      const tiles = L.tileLayer(IMAGERY_TILES, { maxZoom: 21, maxNativeZoom: SAFE_ZOOM, attribution: 'Imagery &copy; Esri and its data providers' }).addTo(map);
      tilesRef.current = tiles;
      // The far view counts as shown once its own pictures are in. Two seconds is the longest wait.
      const farViewShown = new Promise<void>((shown) => {
        tiles.once('load', () => shown());
        setTimeout(shown, 2000);
      });
      streetRef.current = L.layerGroup().addTo(map);
      siteRef.current = L.layerGroup().addTo(map);
      deviceRef.current = L.layerGroup().addTo(map);
      panelsRef.current = L.layerGroup().addTo(map);
      outlineRef.current = L.layerGroup().addTo(map);
      map.on('click', (e) => {
        if (liveRef.current.mode === 'draw') setPoints((prev) => [...prev, [e.latlng.lat, e.latlng.lng]]);
        else void liveRef.current.pickAt(e.latlng.lat, e.latlng.lng);
      });
      // Dragging to another neighbourhood can change how close the pictures go.
      map.on('moveend', () => {
        clearTimeout(settle);
        settle = setTimeout(() => {
          const centre = map.getCenter();
          // Not from far out: the whole country shares no single answer.
          if (map.getZoom() >= 14) void matchImagery(centre.lat, centre.lng);
        }, 400);
      });
      mapRef.current = map;
      setMapReady(true);

      // Open on the saved roof if there is one, else on the home's location, else on Bengaluru.
      if (roofAt && saved) {
        const [lat, lon] = roofAt;
        // Before a dive the far view is on screen: learn how deep the pictures go without redrawing it.
        const deepest = flying ? await deepestImagery(lat, lon) : await matchImagery(lat, lon);
        if (cancelled) return;
        if (flying) tiles.options.maxNativeZoom = deepest;
        // Close enough that the roof fills a good part of the view: a small house closer than a
        // factory. But only so far past the real picture. Where the pictures are the sharpest
        // the service has, two levels past still shows a roof. Where they stop a level short, as
        // in most small towns, two levels past is a smear of green and brown, so it is one.
        // A map that has no size yet cannot say what fits; then go one level past the real picture.
        const fits = map.getBoundsZoom(L.latLngBounds(saved).pad(0.9));
        const close = Math.max(SAFE_ZOOM, Math.min(Number.isFinite(fits) ? fits : deepest + 1, deepest + (deepest >= SHARPEST_ZOOM ? 2 : 1)));
        if (flying) {
          // While the far view is on screen, fetch the pictures of every level on the way down,
          // so the dive stays sharp. Then hold for a moment and go.
          const size = map.getSize();
          await Promise.all([farViewShown, warmDive(lat, lon, FAR_ZOOM, Math.min(close, deepest), { x: size.x, y: size.y })]);
          if (cancelled) return;
          takeOff = setTimeout(() => {
            if (cancelled) return;
            map.once('moveend', () => setReveal('trace'));
            map.flyTo([lat, lon], close, { duration: FLY_SECONDS });
          }, 450);
        } else map.setView([lat, lon], close);
      } else if (start) void showPlace(start.lat, start.lon);
      else void matchImagery(12.9716, 77.5946);
    })();
    return () => {
      cancelled = true;
      clearTimeout(settle);
      clearTimeout(takeOff);
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // The start position, the saved roof and the kind of reveal are only used when the map is first created.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Where the device is: a dot, and a circle as wide as its doubt. A wide circle means the
  // building picked may be the wrong one.
  useEffect(() => {
    const L = leafletRef.current;
    const layer = deviceRef.current;
    if (!L || !layer) return;
    layer.clearLayers();
    // Nothing is drawn on the map while it flies in. A drawing made over the whole country is
    // stretched thousands of times on the way down, which is heavy work for the browser.
    if (!device || reveal === 'fly') return;
    L.circle([device.lat, device.lon], { radius: device.accuracyM, color: '#38bdf8', weight: 1, fillColor: '#38bdf8', fillOpacity: 0.08, interactive: false }).addTo(layer);
    L.circleMarker([device.lat, device.lon], { radius: 4, color: '#ffffff', weight: 1.5, fillColor: '#0ea5e9', fillOpacity: 1, interactive: false }).addTo(layer);
  }, [device, mapReady, reveal]);

  // The neighbourhood. When the person asks what everyone around could do, the view pulls back
  // until all of it is in sight and the roofs light up one after another, outwards from the
  // home. Nothing is added while the map is moving, and nothing before the home's own roof
  // has finished appearing.
  const loadStreetRef = useRef(loadStreet);
  useEffect(() => {
    loadStreetRef.current = loadStreet;
  });
  const streetKey = street?.key ?? '';
  const [streetLit, setStreetLit] = useState('');
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const layer = streetRef.current;
    if (!L || !map || !layer) return;
    layer.clearLayers();
    setStreetLit('');
    // The picture is taller while a neighbourhood is shown, and the map has to be told its new size.
    map.invalidateSize({ animate: false });
    if (!street || reveal !== 'done') return;
    let cancelled = false;
    let drawn = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    (async () => {
      const rings = await loadStreetRef.current?.().catch(() => null);
      if (cancelled || !rings?.length) return;
      const draw = () => {
        if (cancelled || drawn) return;
        drawn = true;
        // However many roofs there are, the last one lights within about three seconds.
        const step = Math.min(16, 2600 / rings.length);
        rings.forEach((ring, i) => {
          const lit = L.polygon(ring, { ...ROOF_LIT, className: 'dhoop-roof-lit', interactive: false }).addTo(layer);
          // Under the home's own outline and panels, whatever the order they were drawn in.
          lit.bringToBack();
          const path = lit.getElement() as SVGPathElement | undefined;
          if (path) path.style.animationDelay = `${Math.round(i * step)}ms`;
        });
        setStreetLit(streetKey);
      };
      const around = L.latLng(street.lat, street.lon).toBounds(street.radiusM * 2.1);
      map.once('moveend', () => timers.push(setTimeout(draw, 150)));
      map.flyToBounds(around, { duration: 1.1, maxZoom: map.getZoom() });
      // A map that already shows all of it does not move, and so never says it has stopped.
      timers.push(setTimeout(draw, 1900));
    })();
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      layer.clearLayers();
    };
    // The street's numbers change with its key. The loader is read from a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streetKey, reveal, mapReady]);

  // A solar farm's site. When Dhoop has looked for one, the view goes to the best place and the
  // land the plant needs is marked on it: a square of the right size. It jumps there without a
  // flight, because the home's panels are still drawn and a long flight stretches them. When the
  // talk turns back to the roof, the view goes back to where it was.
  const siteKey = site?.key ?? '';
  const [siteShown, setSiteShown] = useState('');
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const layer = siteRef.current;
    if (!L || !map || !layer) return;
    layer.clearLayers();
    setSiteShown('');
    const best = site?.picks[0];
    if (!site || !best || reveal !== 'done') return;
    const was = { centre: map.getCenter(), zoom: map.getZoom() };
    const half = site.sideM / 2;
    const dLat = half / 111_132;
    const dLon = half / (111_320 * Math.cos((best.lat * Math.PI) / 180));
    const square: [number, number][] = [
      [best.lat - dLat, best.lon - dLon],
      [best.lat - dLat, best.lon + dLon],
      [best.lat + dLat, best.lon + dLon],
      [best.lat + dLat, best.lon - dLon],
    ];
    let cancelled = false;
    (async () => {
      const deepest = await matchImagery(best.lat, best.lon);
      if (cancelled) return;
      const fits = map.getBoundsZoom(L.latLngBounds(square).pad(1.5));
      map.setView([best.lat, best.lon], Math.max(13, Math.min(Number.isFinite(fits) ? fits : 16, deepest)), { animate: false });
      L.polygon(square, { color: '#fde047', weight: 3, dashArray: '10 7', fillColor: '#f59e0b', fillOpacity: 0.3, className: 'dhoop-site', interactive: false }).addTo(layer);
      setSiteShown(siteKey);
    })();
    return () => {
      cancelled = true;
      layer.clearLayers();
      try {
        // Unless the map itself is going away.
        if (mapRef.current === map) map.setView(was.centre, was.zoom, { animate: false });
      } catch {
        // The map has gone.
      }
    };
    // The site's own figures change with its key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey, reveal, mapReady]);

  // The outline. For a roof being revealed it traces itself once, then the panels follow.
  useEffect(() => {
    const L = leafletRef.current;
    const layer = outlineRef.current;
    if (!L || !layer) return;
    layer.clearLayers();
    if (reveal === 'fly') return;
    let next: ReturnType<typeof setTimeout> | undefined;
    if (points.length >= 2) {
      const outline = L.polygon(points, { color: '#fbbf24', weight: 3, fillColor: '#2563eb', fillOpacity: points.length >= 3 ? 0.18 : 0, interactive: false }).addTo(layer);
      const path = outline.getElement() as SVGPathElement | undefined;
      if (reveal === 'trace' && path && tracedFor.current !== savedKey) {
        tracedFor.current = savedKey;
        const length = path.getTotalLength();
        path.style.strokeDasharray = `${length}`;
        path.style.strokeDashoffset = `${length}`;
        path.style.fillOpacity = '0';
        // Read the box so the browser takes the starting state before the change.
        path.getBoundingClientRect();
        // The tint is fully in by the time the panels start, when this outline is redrawn at rest.
        path.style.transition = `stroke-dashoffset ${TRACE_MS}ms ease-out, fill-opacity 500ms ease ${TRACE_MS - 650}ms`;
        path.style.strokeDashoffset = '0';
        path.style.fillOpacity = '0.18';
      }
    }
    if (reveal === 'trace') next = setTimeout(() => setReveal('panels'), points.length >= 2 ? TRACE_MS - 150 : 0);
    if (mode === 'draw') points.forEach((p) => L.circleMarker(p, { radius: 6, color: '#ffffff', weight: 2, fillColor: '#f59e0b', fillOpacity: 1, interactive: false }).addTo(layer));
    return () => clearTimeout(next);
  }, [points, mode, mapReady, reveal, savedKey]);

  // The panels, dropped onto the roof one by one in the order a crew would lay them.
  const showPanels = (mode === 'pick' || savedOnce) && (reveal === 'panels' || reveal === 'done');
  useEffect(() => {
    const L = leafletRef.current;
    const layer = panelsRef.current;
    if (!L || !layer) return;
    if (!showPanels) {
      layer.clearLayers();
      panelLayers.current = [];
      builtFor.current = null;
      return;
    }
    if (builtFor.current === shapes) return;
    builtFor.current = shapes;
    layer.clearLayers();
    // However many there are, the last one lands within about two and a half seconds.
    const step = shapes.length ? Math.min(70, 2400 / shapes.length) : 0;
    panelLayers.current = shapes.map((shape, i) => {
      const panel = L.polygon(shape, { ...PANEL_ON, className: 'dhoop-panel', interactive: false }).addTo(layer);
      const path = panel.getElement() as SVGPathElement | undefined;
      if (path) path.style.animationDelay = `${Math.round(i * step)}ms`;
      return panel;
    });
    if (reveal !== 'panels') return;
    const landed = setTimeout(() => setReveal('done'), shapes.length * step + 500);
    return () => clearTimeout(landed);
  }, [shapes, showPanels, reveal, mapReady]);

  // Once Dhoop recommends a system, its panels stay lit and the rest of the room on the roof dims.
  // On a very large roof one rectangle stands for a block of panels, so the system lights fewer of them.
  const panelsEach = shapes.length ? Math.max(1, panelsFit / shapes.length) : 1;
  const systemPanels = design?.panels ? Math.max(1, Math.ceil(design.panels / panelsEach)) : 0;
  useEffect(() => {
    if (reveal !== 'done' || !showPanels) return;
    const timers = panelLayers.current.map((panel, i) =>
      setTimeout(() => panel.setStyle(systemPanels > 0 && i >= systemPanels ? PANEL_ROOM : PANEL_ON), systemPanels > 0 ? Math.min(i * 25, 1500) : 0),
    );
    return () => timers.forEach(clearTimeout);
  }, [systemPanels, reveal, showPanels, shapes]);

  const search = async () => {
    if (query.trim().length < 3) return setMessage('Type at least three letters.');
    setBusy(true);
    setMessage(null);
    try {
      // Places near the home's city, when Dhoop already knows it, come first.
      const near = start ? `&near=${start.lat},${start.lon}` : '';
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(query.trim())}${near}`);
      const data = await res.json();
      if (!res.ok) return setMessage(data.error ?? 'Place not found.');
      const deepest = await showPlace(data.lat, data.lon);
      const what = mode === 'pick' ? 'tap your building' : 'tap the corners of the roof';
      setMessage(
        deepest < SHARPEST_ZOOM
          ? `Showing ${data.label}. Satellite pictures are less sharp here than in big cities. Drag the map to your building and ${what}, or tell Dhoop the roof size instead.`
          : `Showing ${data.label}. Drag the map to your building, then ${what}.`,
      );
    } catch {
      setMessage('Could not search. Check the internet connection.');
    } finally {
      setBusy(false);
    }
  };

  /** Use this device's own location to find the building, the same way the agent does by itself. */
  const findMine = async () => {
    setBusy(true);
    setMessage('Asking this device where it is…');
    try {
      // The asking is kept apart from what follows it, so that a refusal by the phone is not
      // taken for a fault of the network, nor the other way about.
      let where: GeolocationPosition;
      try {
        if (!navigator.geolocation) throw Object.assign(new Error('no location'), { fault: window.isSecureContext ? 'unsupported' : 'insecure' });
        const ask = (options: PositionOptions) => new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, options));
        try {
          where = await ask({ enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 });
        } catch (first) {
          // Refused is refused. Too slow, or no fix: indoors a phone often has a rough position
          // from Wi-Fi and masts long before it has an exact one, and a rough one finds the street.
          if ((first as GeolocationPositionError)?.code === 1) throw first;
          setMessage('Still looking: trying for a rougher fix…');
          where = await ask({ enableHighAccuracy: false, timeout: 15_000, maximumAge: 300_000 });
        }
      } catch (refusal) {
        const fault = (refusal as { fault?: LocationFault }).fault ?? faultOf((refusal as GeolocationPositionError)?.code);
        setMessage(locationHelp(fault, navigator.userAgent));
        return;
      }
      await post({ type: 'device_location', lat: where.coords.latitude, lon: where.coords.longitude, accuracy: where.coords.accuracy });
      setMessage('Looking for your building…');
      const result = (await post({ type: 'roof_find' })) as { found?: boolean; error?: string } | null;
      if (!result?.found) {
        await showPlace(where.coords.latitude, where.coords.longitude);
        setMessage(result?.error ?? 'No building is mapped where this device is. Tap your building, or draw the corners of the roof.');
      }
    } catch {
      setMessage('This device shared its location, but Dhoop could not look the place up. Check the internet connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  // The call asks for the device's location as it starts (DhoopApp). When the phone refuses
  // then, the person is told here, where the map is, and not left wondering why nothing moved.
  useEffect(() => {
    const onFault = (e: Event) => {
      const code = Number((e as CustomEvent<unknown>).detail);
      if (code === 1) setMessage(locationHelp('refused', navigator.userAgent));
    };
    window.addEventListener('dhoop:location-fault', onFault);
    return () => window.removeEventListener('dhoop:location-fault', onFault);
  }, []);

  const areaM2 = polygonAreaM2(points);
  const cap = roofCapacity(areaM2, shadePct / 100);

  const save = async () => {
    if (points.length < 3) return setMessage('Tap at least three corners first.');
    setBusy(true);
    await post({ type: 'roof_satellite', polygon: points, shadeFraction: shadePct / 100 });
    setBusy(false);
    setSavedOnce(true);
    setMessage('Roof saved. Ask Dhoop to check the roof.');
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setSavedOnce(false);
    if (next === 'draw') {
      setPoints([]);
      setMessage('Tap each corner of the roof in turn.');
    } else {
      setPoints(saved ?? []);
      setMessage('Tap your building and Dhoop will outline it.');
    }
  };

  const modeButton = (m: Mode, label: string) => (
    <button
      type="button"
      onClick={() => switchMode(m)}
      aria-pressed={mode === m}
      className={`rounded px-2.5 py-1 text-xs font-medium ${mode === m ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'}`}
    >
      {label}
    </button>
  );

  // The numbers count up while the panels land, and again when the recommendation arrives.
  const counting = reveal === 'panels' || reveal === 'done';
  const stat = (value: React.ReactNode, label: string) => (
    <div className="min-w-0">
      <p className="text-lg font-semibold leading-tight tabular-nums text-white sm:text-xl">{value}</p>
      <p className="text-[11px] leading-tight text-white/75">{label}</p>
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={findMine} disabled={busy} className="h-9 rounded-md bg-amber-400 px-3 text-sm font-semibold text-amber-950 hover:bg-amber-300 disabled:opacity-60">
          Find my building
        </button>
        <form
          className="flex min-w-0 flex-1 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void search();
          }}
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Or search: DivyaSree Technopark, Bengaluru"
            aria-label="Address or landmark"
            className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm"
          />
          <button type="submit" disabled={busy} className="h-9 rounded-md border border-border px-3 text-sm font-medium hover:bg-accent disabled:opacity-60">
            Find
          </button>
        </form>
      </div>

      <div className="relative">
        {/* The height lives on this wrapper. The map library keeps its own classes on the element inside, and a class changed there by React would wipe them out: the pictures then vanish. */}
        <div className={street ? 'h-[30rem]' : 'h-[22rem]'}>
          <div
            ref={elRef}
            className="h-full w-full overflow-hidden rounded-lg border border-border"
            role="application"
            aria-label={mode === 'pick' ? 'Satellite view. Tap your building.' : 'Satellite view. Tap the corners of the roof.'}
          />
        </div>
        {site && siteShown === site.key ? (
          <div className="pointer-events-none absolute bottom-3 left-3 z-[1000] grid max-w-[calc(100%-1.5rem)] grid-cols-3 gap-x-5 gap-y-1 rounded-lg bg-black/70 px-4 py-2.5 shadow-lg backdrop-blur-sm" aria-live="polite">
            <p className="col-span-3 truncate text-xs font-semibold text-amber-300">Best place for a solar farm: near {site.picks[0].name}</p>
            {stat(<>{site.capacityMw} MW</>, 'solar farm')}
            {stat(<><Rolling value={site.acres * 10} run format={(n) => (n / 10).toFixed(1)} /> acres</>, 'the square marked')}
            {stat(<Rolling value={site.unitsAYear} run format={(n) => (n >= 1e7 ? `${(n / 1e7).toFixed(1)} crore` : n >= 1e5 ? `${(n / 1e5).toFixed(1)} lakh` : whole(n))} />, 'units a year')}
          </div>
        ) : hasRoof && roof && showPanels && (
          <div className="pointer-events-none absolute bottom-3 left-3 z-[1000] grid max-w-[calc(100%-1.5rem)] grid-cols-3 gap-x-5 gap-y-1 rounded-lg bg-black/70 px-4 py-2.5 shadow-lg backdrop-blur-sm" aria-live="polite">
            {roof.name && <p className="col-span-3 truncate text-xs font-semibold text-amber-300">{roof.name}</p>}
            {/* The keys make each set of numbers start from nothing, not from the other set's values. */}
            {street && streetLit === street.key ? (
              <Fragment key={`street:${street.key}`}>
                {stat(<Rolling value={street.roofs} run />, `roofs within ${street.radiusM} m`)}
                {street.kw >= 1000
                  ? stat(<><Rolling value={street.kw / 10} run format={(n) => (n / 100).toFixed(2)} /> MW</>, 'if every roof were filled')
                  : stat(<><Rolling value={street.kw} run /> kW</>, 'if every roof were filled')}
                {stat(<Rolling value={street.rupeesAYear} run format={inrShort} />, 'of electricity a year')}
              </Fragment>
            ) : design ? (
              <Fragment key="system">
                {stat(<><Rolling value={design.kw * 10} run={counting} format={(n) => (n / 10).toFixed(1)} /> kW</>, `${design.panels} panels lit`)}
                {stat(<Rolling value={design.monthlySavings * 12} run={counting} format={inr} />, 'saved a year')}
                {stat(<Rolling value={design.subsidy} run={counting} format={inr} />, `subsidy · pays back in ${design.paybackYears} years`)}
              </Fragment>
            ) : (
              <Fragment key="roof">
                {stat(<Rolling value={roof.areaM2 * SQFT_PER_M2} run={counting} />, 'sq ft of roof')}
                {stat(<Rolling value={roof.panelsFit} run={counting} />, 'panels fit')}
                {roof.capacityKw >= 1000
                  ? stat(<><Rolling value={roof.capacityKw / 10} run={counting} format={(n) => (n / 100).toFixed(2)} /> MW</>, 'at the most')
                  : stat(<><Rolling value={roof.capacityKw * 10} run={counting} format={(n) => (n / 10).toFixed(1)} /> kW</>, 'at the most')}
              </Fragment>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <div className="flex rounded-md border border-border p-0.5" role="group" aria-label="How to mark the roof">
          {modeButton('pick', 'Tap my building')}
          {modeButton('draw', 'Draw the corners')}
        </div>
        <span className="font-medium">
          {points.length >= 3
            ? `${Math.round(areaM2 * SQFT_PER_M2).toLocaleString('en-IN')} sq ft, room for ${cap.panels} panels`
            : mode === 'draw'
              ? `Tap the roof corners (${points.length} so far)`
              : 'No building outlined yet'}
        </span>
        <label className="flex items-center gap-2 text-muted-foreground">
          Shade {shadePct}%
          <input type="range" min={0} max={60} step={5} value={shadePct} onChange={(e) => setShadePct(Number(e.target.value))} aria-label="Share of the roof in shade" />
        </label>
        <div className="flex gap-2">
          {mode === 'draw' && (
            <>
              <button type="button" onClick={() => setPoints((p) => p.slice(0, -1))} disabled={!points.length} className="rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50">
                Undo
              </button>
              <button type="button" onClick={() => setPoints([])} disabled={!points.length} className="rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50">
                Clear
              </button>
            </>
          )}
          <button type="button" onClick={save} disabled={busy || points.length < 3} className="rounded-md border border-border px-3 py-1 text-xs font-semibold hover:bg-accent disabled:opacity-50">
            {savedOnce ? 'Save again' : mode === 'draw' ? 'Use this roof' : 'Save with this shade'}
          </button>
        </div>
      </div>
      {message && <p className="text-xs text-muted-foreground">{message}</p>}
    </div>
  );
}
