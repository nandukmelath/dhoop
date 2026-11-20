import { NextRequest, NextResponse } from 'next/server';
import { ASSUMPTIONS, SQFT_PER_M2 } from '@/lib/dhoop/config';
import { findRoofAt, metresBetween, shouldFollow, TOO_ROUGH_M } from '@/lib/dhoop/findroof';
import { polygonAreaM2, roofCapacity, tariffFromBill } from '@/lib/dhoop/solar';
import { ensureSession, getSession, updateSession, type View } from '@/lib/dhoop/store';

/** What the screens read (GET) and what the camera, map and forms report (POST). */

export async function GET(request: NextRequest, ctx: { params: Promise<{ sid: string }> }) {
  const { sid } = await ctx.params;
  const s = getSession(sid) ?? ensureSession(sid);
  const since = Number(new URL(request.url).searchParams.get('rev') ?? 0);
  if (since && since === s.rev) return NextResponse.json({ rev: s.rev, unchanged: true });
  // The screens need the facts, not the words: what was said stays on the server, and only
  // a count goes out, so the start page can tell that there is something to carry on from.
  return NextResponse.json({ ...s, turns: undefined, turnsFrom: undefined, remembered: s.turns?.length ?? 0 });
}

const VIEWS: View[] = ['welcome', 'bill', 'roof', 'design', 'compare', 'steps', 'quotes', 'booked'];

export async function POST(request: NextRequest, ctx: { params: Promise<{ sid: string }> }) {
  const { sid } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Bad JSON.' }, { status: 400 });
  }
  ensureSession(sid);

  switch (body.type) {
    // The camera looked at the model roof and found which cells are in the light.
    case 'roof_model': {
      const cols = Number(body.cols);
      const rows = Number(body.rows);
      const lit = Array.isArray(body.lit) ? body.lit.map(Boolean) : [];
      if (!(cols > 0 && rows > 0) || lit.length !== cols * rows) return NextResponse.json({ error: 'Bad grid.' }, { status: 400 });
      // On the model each grid cell stands for one panel slot, so the roof it represents is
      // however large a terrace needs to be to hold that many panels (about 1,200 sq ft for 18).
      const slotM2 = ((ASSUMPTIONS.panelWatts / 1000) * ASSUMPTIONS.areaPerKwM2) / ASSUMPTIONS.usableRoofShare;
      const areaM2 = lit.length * slotM2;
      const litCount = lit.filter(Boolean).length;
      const shade = 1 - litCount / lit.length;
      const cap = { ...roofCapacity(areaM2, shade), panels: litCount, kw: Math.round(litCount * ASSUMPTIONS.panelWatts) / 1000 };
      const prev = getSession(sid)?.roof;
      const changed = !prev || prev.source !== 'model' || Math.abs(prev.shadeFraction - shade) > 0.001 || prev.grid?.lit.join() !== lit.join();
      if (changed) {
        updateSession(sid, (s) => {
          s.roof = { areaM2, shadeFraction: shade, usableM2: cap.usableM2, capacityKw: cap.kw, panelsFit: cap.panels, source: 'model', grid: { cols, rows, lit } };
        });
      }
      return NextResponse.json({ ok: true, shade, panelsFit: cap.panels, capacityKw: cap.kw });
    }
    // The person tapped the corners of their real roof on the satellite view.
    // The person's browser shared where it is. Nothing is looked up yet: the agent, or the
    // "Find my building" button, decides when to use it.
    case 'device_location': {
      const lat = Number(body.lat);
      const lon = Number(body.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) {
        return NextResponse.json({ error: 'That is not a place.' }, { status: 400 });
      }
      const accuracyM = Math.min(Math.max(Number(body.accuracy) || 50, 1), 5000);
      const before = getSession(sid)?.device;
      // The first report of a call, or the first this session has ever had.
      const first = body.first === true || !before;
      // A device that knew only its neighbourhood and now knows its street counts as having moved.
      const sharpened = !!before && before.accuracyM > TOO_ROUGH_M && accuracyM <= TOO_ROUGH_M;
      const movedM = before && !sharpened ? metresBetween(before.used ?? before, { lat, lon }) : Infinity;
      updateSession(sid, (s) => {
        s.device = { lat, lon, accuracyM, at: Date.now(), used: s.device?.used };
        if (first) s.followDevice = true;
      });
      if (!shouldFollow({ first, following: getSession(sid)?.followDevice === true, movedM })) {
        return NextResponse.json({ ok: true, used: false });
      }
      // Act on it at once: go to that spot, name the place and pick out the building there.
      const result = await findRoofAt(sid, { lat, lon, accuracyM }, 'device');
      updateSession(sid, (s) => {
        if (s.device) s.device.used = { lat, lon };
      });
      return NextResponse.json({ ok: true, used: true, found: result.found === true, place: result.place ?? null });
    }
    // Pick out the building at a spot and measure it. With lat and lon, the person tapped it
    // on the satellite view. Without them, the device's own location is used.
    case 'roof_find': {
      const tapped = body.lat !== undefined && body.lon !== undefined;
      const device = getSession(sid)?.device;
      const spot = tapped ? { lat: Number(body.lat), lon: Number(body.lon) } : device;
      if (!spot || !Number.isFinite(spot.lat) || !Number.isFinite(spot.lon) || Math.abs(spot.lat) > 90 || Math.abs(spot.lon) > 180) {
        return NextResponse.json({ ok: false, found: false, error: 'No location to look at yet.' }, { status: 400 });
      }
      // A tap is the person's own choice, so the device stops moving the home. The button hands it back.
      updateSession(sid, (s) => {
        s.followDevice = !tapped;
      });
      return NextResponse.json(await findRoofAt(sid, spot, tapped ? 'tap' : 'device'));
    }
    case 'roof_satellite': {
      const polygon = (Array.isArray(body.polygon) ? body.polygon : []).filter((p): p is [number, number] => Array.isArray(p) && p.length === 2 && p.every((n) => Number.isFinite(Number(n)))).map((p) => [Number(p[0]), Number(p[1])] as [number, number]);
      if (polygon.length < 3) return NextResponse.json({ error: 'Need at least three corners.' }, { status: 400 });
      const areaM2 = polygonAreaM2(polygon);
      const shade = Math.min(Math.max(Number(body.shadeFraction) || 0, 0), 0.9);
      const cap = roofCapacity(areaM2, shade);
      updateSession(
        sid,
        (s) => {
          s.roof = { areaM2, shadeFraction: shade, usableM2: cap.usableM2, capacityKw: cap.kw, panelsFit: cap.panels, source: 'satellite', polygon };
          s.view = 'roof';
          // The person drew or confirmed this roof, so the device no longer moves the home.
          s.followDevice = false;
        },
        { kind: 'roof_satellite', text: `Roof marked on the satellite view: ${Math.round(areaM2 * SQFT_PER_M2).toLocaleString('en-IN')} sq ft` },
      );
      return NextResponse.json({ ok: true, areaM2, panelsFit: cap.panels, capacityKw: cap.kw });
    }
    // Typed fallback for the bill, for when speech or the camera will not cooperate.
    case 'bill_form': {
      const amount = Number(body.amount) || 0;
      let units = Number(body.monthlyUnits) || 0;
      if (units <= 0 && amount > 0) units = Math.round(amount / ASSUMPTIONS.defaultTariff);
      if (units <= 0) return NextResponse.json({ error: 'Need units or an amount.' }, { status: 400 });
      const tariff = tariffFromBill(units, amount);
      updateSession(
        sid,
        (s) => {
          s.bill = { monthlyUnits: units, amount: amount > 0 ? amount : Math.round(units * tariff), tariff, source: 'form' };
          s.view = 'bill';
        },
        { kind: 'bill_form', text: `Bill typed in: ${units} units a month` },
      );
      return NextResponse.json({ ok: true });
    }
    case 'view': {
      const view = body.view as View;
      if (!VIEWS.includes(view)) return NextResponse.json({ error: 'Unknown view.' }, { status: 400 });
      updateSession(sid, (s) => {
        s.view = view;
      });
      return NextResponse.json({ ok: true });
    }
    // The button under "Take it home" plays the solar story, as the agent's tool does.
    case 'story': {
      updateSession(sid, (s) => {
        s.story = { key: `story-${Math.random().toString(36).slice(2, 8)}`, at: Date.now() };
      });
      return NextResponse.json({ ok: true });
    }
    case 'reset': {
      updateSession(sid, (s) => {
        s.view = 'welcome';
        s.bill = s.roof = s.design = s.compare = s.survey = s.booking = s.location = undefined;
        s.roofSteps = undefined;
        s.street = undefined;
        s.site = undefined;
        s.places = undefined;
        s.vendors = undefined;
        s.week = undefined;
        s.now = undefined;
        s.longRun = undefined;
        s.langAsk = undefined;
        s.story = undefined;
        s.stepsShown = false;
        s.application = undefined;
        s.loan = undefined;
        s.quotes = [];
        s.log = [];
      });
      return NextResponse.json({ ok: true });
    }
    default:
      return NextResponse.json({ error: 'Unknown update type.' }, { status: 400 });
  }
}
