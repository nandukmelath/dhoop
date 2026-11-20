/**
 * Checks for Dhoop's maths and tools. Needs no Agora or Murf account and no network.
 * Run with: npm run test:dhoop
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { inflateSync } from 'node:zlib';
import { generateConvoAIToken } from 'agora-agents';
import { chooseNamedBuilding, chooseBuilding, distanceToRingM, insideRing, wholeBuilding, type Outline, type Ring } from '../lib/dhoop/buildings';
import { chooseListening, engineOf, forgetListeningTrouble, murfVoice, noteListeningFailed, TROUBLE_MS } from '../lib/dhoop/agent';
import { isLang, LANG_ORDER, LANGS, SUBSIDY, type Lang } from '../lib/dhoop/config';
import { metresBetween, namedReach, searchRadiusM, shouldFollow } from '../lib/dhoop/findroof';
import { deepestImagery, diveTiles, forgetImagery, SAFE_ZOOM, tileAt } from '../lib/dhoop/imagery';
import { conversationSoFar, hasMemory, turnsFromHistory } from '../lib/dhoop/memory';
import { hotwords, keyterms, MOST_HOTWORDS, SAFE_HOTWORDS } from '../lib/dhoop/hotwords';
import { layoutPanels, MOST_PANELS_DRAWN } from '../lib/dhoop/panels';
import { PASSBOOK, voiceNote } from '../lib/dhoop/passbook';
import { findCity, geocode, likeliestPlace, mapNameFor, pickNamed, sameName, type PlaceHit } from '../lib/dhoop/places';
import { isTourSession, TOUR } from '../lib/dhoop/tour';
import { clearSkyWatts, cloudAt, sunHeight, todayOf, underCloud, weekOf, type SkyPoint } from '../lib/dhoop/sky';
import { FAILURE_LINES, GREETINGS, RECOVER_LINES, RESUME_LINES, RETURN_LINES, systemPrompt } from '../lib/dhoop/prompt';
import { middleOf, neighbourIn, reshapeRing, shiftRing } from '../lib/dhoop/reshape';
import { roofMark } from '../lib/dhoop/roofedit';
import { agoraAuth } from '../lib/dhoop/server';
import { cleanPasted, hasProjectNamed, parseAgoraEnv, setupAllowed, writeEnv } from '../lib/dhoop/setup';
import { classifyCells } from '../lib/dhoop/shade';
import { quietLeft, quietLimits } from '../lib/dhoop/quiet';
import { farmMoney, farmSize, gridOver, pickSites, rankPlaces, ringAround, wayFrom, withinRegion, vendorsForModel, vendorsShown } from '../lib/dhoop/site';
import { streetTotals } from '../lib/dhoop/street';
import { vendorsFor, VENDOR_DISTRICTS, VENDOR_LISTS, VENDOR_STATES } from '../lib/dhoop/vendors';
import { inLakh, longRun } from '../lib/dhoop/longrun';
import { deviceKind, faultOf, iphoneBrowser, locationHelp } from '../lib/dhoop/whereami';
import { timeSaid, visitCalendar, visitSaid, whenIs } from '../lib/dhoop/visit';
import { appliancesSaid, askedCovered, bestHour, clockSaid, powerFrom, shareSaid, unitsFromHours, usualCovered } from '../lib/dhoop/power';
import { bestAhead, dayName, skyWord, sunHoursFromMj, unitsOn, weekOutlook } from '../lib/dhoop/outlook';
import { designSystem, monthlyInstalment, polygonAreaM2, roofCapacity, standardSizeAtLeast, standardSizeAtMost, subsidyForKw, tariffFromBill, throughTheYear } from '../lib/dhoop/solar';
import { eligibilityVerdict, SUBSIDY_STEPS } from '../lib/dhoop/steps';
import { ensureSession, getSession, MAX_TURNS, rememberTurns, resetStore, sessionOfAgent, updateSession } from '../lib/dhoop/store';
import { agoraTools, beforeTool, findTool, sessionBrief, TOOLS, languageSaid } from '../lib/dhoop/tools';

test('subsidy follows the official slabs', () => {
  assert.equal(subsidyForKw(0), 0);
  assert.equal(subsidyForKw(1), 30_000);
  assert.equal(subsidyForKw(2), 60_000);
  assert.equal(subsidyForKw(2.5), 69_000);
  assert.equal(subsidyForKw(3), 78_000);
  assert.equal(subsidyForKw(5), SUBSIDY.cap);
  assert.equal(subsidyForKw(10), SUBSIDY.cap);
});

test('standard sizes round the right way', () => {
  assert.equal(standardSizeAtLeast(2.2), 2.5);
  assert.equal(standardSizeAtLeast(2.1), 2); // within five percent of 2 kW
  assert.equal(standardSizeAtLeast(0.2), 1);
  assert.equal(standardSizeAtMost(2.9), 2.5);
  assert.equal(standardSizeAtMost(0.4), 1);
});

test('tariff comes from the bill when it is believable', () => {
  assert.equal(tariffFromBill(300, 2400), 8);
  assert.equal(tariffFromBill(300, 0), 7);
  assert.equal(tariffFromBill(300, 90_000), 7); // misread bill
});

test('a typical Bengaluru home gets a sensible design', () => {
  const d = designSystem({ monthlyUnits: 310, billAmount: 3200, sunHours: 5.48 });
  assert.equal(d.kw, 2.5);
  assert.equal(d.subsidy, 69_000);
  assert.ok(d.monthlyGeneration > 280 && d.monthlyGeneration < 340, `generation ${d.monthlyGeneration}`);
  assert.ok(d.billAfter < d.billBefore);
  assert.ok(d.billAfter >= d.billBefore * 0.1 - 1, 'fixed charges remain');
  assert.ok(d.paybackYears > 1 && d.paybackYears < 10, `payback ${d.paybackYears}`);
  assert.equal(d.netCost, d.grossCost - d.subsidy);
});

test('the roof caps the system when it is small or shaded', () => {
  const open = roofCapacity(60, 0);
  const shaded = roofCapacity(60, 0.5);
  assert.ok(open.kw > shaded.kw);
  assert.ok(Math.abs(shaded.kw - open.kw / 2) < 0.02);
  const d = designSystem({ monthlyUnits: 600, billAmount: 5400, sunHours: 5.5, roofCapacityKw: shaded.kw });
  assert.ok(d.limitedByRoof);
  assert.ok(d.kw <= shaded.kw);
});

test('polygon area matches a known rectangle', () => {
  // About 10 m by 8 m at Bengaluru's latitude.
  const lat = 12.97;
  const dLat = 8 / 111_132;
  const dLon = 10 / (111_320 * Math.cos((lat * Math.PI) / 180));
  const area = polygonAreaM2([[lat, 77.59], [lat, 77.59 + dLon], [lat + dLat, 77.59 + dLon], [lat + dLat, 77.59]]);
  assert.ok(Math.abs(area - 80) < 1, `area ${area}`);
});

test('old city names are understood', () => {
  assert.equal(findCity('Bangalore')?.label, 'Bengaluru');
  assert.equal(findCity('whitefield bengaluru')?.label, 'Bengaluru');
  assert.equal(findCity('Mysore')?.label, 'Mysuru');
  assert.equal(findCity('zzzz'), undefined);
});

test('tools carry a conversation from bill to booking', async () => {
  resetStore();
  const sid = 'test-session';
  ensureSession(sid, 'en');
  const call = (name: string, args: Record<string, unknown>) => findTool(name)!.run(sid, args);

  assert.equal((await call('designSolar', { target_kw: 0 })).ok, false, 'needs a bill first');
  // Values arrive as strings when Agora fills the body template.
  assert.equal((await call('saveBill', { monthly_units: '310', bill_amount: '3200', source: 'spoken' })).ok, true);
  assert.equal(getSession(sid)!.bill!.monthlyUnits, 310);

  assert.equal((await call('getRoofSurvey', { reason: 'check' })).measured, false);
  assert.equal((await call('setRoofManual', { area_sqft: 650, shade_percent: 20 })).ok, true);
  const survey = await call('getRoofSurvey', { reason: 'check' });
  assert.equal(survey.measured, true);
  assert.ok((survey.panels_that_fit as number) > 0);

  const design = await call('designSolar', { target_kw: 0 });
  assert.equal(design.ok, true);
  assert.ok((design.system_kw as number) > 0);
  assert.equal(getSession(sid)!.view, 'design');

  const cmp = await call('compareSizes', { kw_a: 2, kw_b: 3 });
  assert.equal((cmp.first as { government_subsidy_rupees: number }).government_subsidy_rupees, 60_000);
  assert.equal((cmp.second as { government_subsidy_rupees: number }).government_subsidy_rupees, 78_000);

  assert.equal((await call('subsidySteps', { last_stage_done: -1 })).ok, true);
  assert.equal((await call('getQuotes', { reason: 'check' })).ok, false, 'no survey sent yet');
  assert.equal((await call('requestQuotes', { homeowner_name: 'Asha' })).ok, true);
  updateSession(sid, (s) => {
    s.quotes.push({ id: 'q1', installer: 'Test Solar', price: 150_000, days: 10, at: Date.now() });
  });
  const quotes = await call('getQuotes', { reason: 'check' });
  assert.equal((quotes.quotes as unknown[]).length, 1);
  assert.equal((await call('bookVisit', { installer: 'Test Solar', day: 'Saturday', time: '10 am' })).ok, true);
  assert.equal(getSession(sid)!.view, 'booked');
  assert.match(sessionBrief(sid), /Site visit booked/);
});

test('tool declarations are valid for Agora', () => {
  const decl = agoraTools('https://example.test/', 'abc', 'secret');
  assert.equal(decl.length, TOOLS.length);
  assert.ok(decl.length <= 32, 'Agora allows at most 32 tools');
  for (const t of decl) {
    assert.match(t.function.name, /^[A-Za-z][A-Za-z0-9]{0,63}$/, 'letters and digits only');
    assert.ok(!t.function.name.startsWith('mcp'));
    assert.ok(t.server.url.startsWith('https://example.test/api/tools/'));
    assert.ok(t.server.url.endsWith('?sid=abc'));
    assert.deepEqual(Object.keys(t.server.body), t.function.parameters.required);
  }
});

test('shade finding separates lit cells from shadow', () => {
  // A lamp-lit roof with a shadow across four cells.
  const lums = [210, 205, 198, 90, 85, 200, 207, 201, 195, 80, 190, 199, 204, 196, 188, 192, 110, 197];
  const { lit, reference } = classifyCells(lums, 0.68);
  assert.ok(reference > 190);
  assert.equal(lit.filter((x) => !x).length, 4);
  assert.deepEqual([3, 4, 9, 16].map((i) => lit[i]), [false, false, false, false]);
  // An evenly lit roof has no shade.
  assert.ok(classifyCells([180, 175, 182, 178, 185, 181], 0.68).lit.every(Boolean));
});

test('sizes within five percent round down to the nearer standard size', () => {
  assert.equal(standardSizeAtLeast(5.006), 5);
  assert.equal(standardSizeAtLeast(5.4), 6);
});

test('the setup page answers only to this computer', () => {
  const json = { 'content-type': 'application/json' };
  const local = (extra: Record<string, string> = {}) => new Headers({ host: 'localhost:3000', ...extra });
  assert.equal(setupAllowed(local(), 'GET'), true);
  assert.equal(setupAllowed(local(json), 'POST'), true);
  assert.equal(setupAllowed(local({ ...json, origin: 'http://localhost:3000', 'sec-fetch-site': 'same-origin' }), 'POST'), true);
  // Through a tunnel, with or without the tunnel rewriting the host.
  assert.equal(setupAllowed(new Headers({ host: 'abc.trycloudflare.com', ...json }), 'POST'), false);
  assert.equal(setupAllowed(local({ ...json, 'x-forwarded-for': '203.0.113.9' }), 'POST'), false);
  assert.equal(setupAllowed(local({ ...json, 'x-forwarded-host': 'abc.trycloudflare.com' }), 'POST'), false);
  assert.equal(setupAllowed(local({ 'cf-ray': 'abc' }), 'GET'), false);
  // From another website open in the same browser.
  assert.equal(setupAllowed(local({ 'content-type': 'text/plain' }), 'POST'), false);
  assert.equal(setupAllowed(local({ ...json, origin: 'https://other.example' }), 'POST'), false);
  assert.equal(setupAllowed(local({ ...json, 'sec-fetch-site': 'cross-site' }), 'POST'), false);
  // Never on a built copy.
  const env = process.env as Record<string, string | undefined>;
  const before = env.NODE_ENV;
  env.NODE_ENV = 'production';
  try {
    assert.equal(setupAllowed(local(), 'GET'), false);
  } finally {
    if (before === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = before;
  }
});

test('pasted keys are tidied and the Agora tool output is understood', () => {
  assert.equal(cleanPasted('  MURF_API_KEY="abc_123"  '), 'abc_123');
  assert.equal(cleanPasted('export MURF_API_KEY=abc_123'), 'abc_123');
  assert.equal(cleanPasted('abcDEF123='), 'abcDEF123=');
  const id = '0123456789abcdef0123456789abcdef';
  const certificate = 'fedcba9876543210fedcba9876543210';
  assert.deepEqual(parseAgoraEnv(`AGORA_APP_ID=${id}\nAGORA_APP_CERTIFICATE=${certificate}\n`), { appId: id, certificate });
  assert.deepEqual(parseAgoraEnv(`export NEXT_PUBLIC_AGORA_APP_ID="${id}"\nexport NEXT_AGORA_APP_CERTIFICATE='${certificate}'`), { appId: id, certificate });
  assert.deepEqual(parseAgoraEnv('AGORA_APP_ID=\nSOMETHING=else'), {});
  assert.equal(hasProjectNamed('{"data":{"items":[{"name":"Dhoop"}]}}', 'dhoop'), true);
  assert.equal(hasProjectNamed('{"data":{"items":[{"name":"dhoop-old"}],"keyword":"dhoop"}}', 'dhoop'), false);
  assert.equal(hasProjectNamed('not json', 'dhoop'), false);
});

/** How many seconds an Agora token stays valid, read from the token itself. */
function tokenLifetime(token: string): number {
  const raw = inflateSync(Buffer.from(token.slice(3), 'base64'));
  let at = 2 + raw.readUInt16LE(0); // past the signature
  at += 2 + raw.readUInt16LE(at); // past the App ID
  return raw.readUInt32LE(at + 4); // the issue time comes first, then the lifetime
}

test("the SDK's sign-in tokens last a day, not a second", () => {
  // agora-token 2.0.7 changed the parameters of ConvoAITokenBuilder.buildToken, and agora-agents
  // (2.14.0 and 2.15.0) still calls the older form. Together they build a token that lives one
  // second, and Agora answers "Token is expired". package.json pins agora-token to 2.0.6.
  // This fails if that pin slips.
  const appId = '0123456789abcdef0123456789abcdef';
  const appCertificate = 'fedcba9876543210fedcba9876543210';
  const token = generateConvoAIToken({ appId, appCertificate, channelName: 'check', uid: 0 });
  assert.equal(token.slice(0, 3), '007');
  assert.ok(tokenLifetime(token) >= 3600, `the token lives ${tokenLifetime(token)} s`);

  // Direct calls on client.agents are signed with the same kind of token.
  const env = process.env as Record<string, string | undefined>;
  const before = { id: env.NEXT_PUBLIC_AGORA_APP_ID, certificate: env.NEXT_AGORA_APP_CERTIFICATE };
  env.NEXT_PUBLIC_AGORA_APP_ID = appId;
  env.NEXT_AGORA_APP_CERTIFICATE = appCertificate;
  try {
    const header = agoraAuth().headers.Authorization;
    assert.match(header, /^agora token=007/);
    assert.ok(tokenLifetime(header.slice('agora token='.length)) >= 3600);
  } finally {
    if (before.id === undefined) delete env.NEXT_PUBLIC_AGORA_APP_ID;
    else env.NEXT_PUBLIC_AGORA_APP_ID = before.id;
    if (before.certificate === undefined) delete env.NEXT_AGORA_APP_CERTIFICATE;
    else env.NEXT_AGORA_APP_CERTIFICATE = before.certificate;
  }
});

test('every language is offered, greeted and given a voice', () => {
  const all = Object.keys(LANGS) as Lang[];
  assert.deepEqual([...LANG_ORDER].sort(), [...all].sort());
  for (const lang of all) {
    assert.equal(isLang(lang), true);
    // Each language has every line the agent may speak without the model writing it.
    for (const lines of [GREETINGS, RESUME_LINES, RETURN_LINES, FAILURE_LINES]) assert.ok(lines[lang].length > 5, `a line is missing for ${lang}`);
    assert.ok(murfVoice(lang).length > 0);
  }
  assert.equal(isLang('xx'), false);
  assert.equal(isLang('toString'), false);
  // Agora's own recogniser has no Malayalam, so Malayalam listens through Deepgram and gives
  // Agora a conversation language it does list. Its voice is one that is native to Malayalam.
  assert.equal(LANGS.ml.deepgram, 'ml');
  assert.notEqual(LANGS.ml.asr, 'ml-IN');
  assert.equal(LANGS.ml.murfLocale, 'ml-IN');
  assert.equal(murfVoice('ml'), 'Nimisha');
  assert.equal(murfVoice('kn'), 'Jaya');
});

test('a town name means the town, not its district', async () => {
  // What OpenStreetMap returns for "udupi": the district first, 25 km from the town.
  const district = { place_rank: 10, lat: '13.527', lon: '74.873' };
  const town = { place_rank: 16, lat: '13.342', lon: '74.747' };
  assert.equal(likeliestPlace([district, town]), town);
  assert.equal(likeliestPlace([district]), district);
  assert.equal(likeliestPlace([]), undefined);
  // A building or a street is as specific as it gets, and comes without a rank in some answers.
  const building: { place_rank?: number; lat: string; lon: string } = { lat: '12.97', lon: '77.64' };
  assert.equal(likeliestPlace([district, building]), building);
  // A bare city from the bundled list is answered without the network.
  assert.equal((await geocode('Kochi'))?.label, 'Kochi');
});

test('the building at a spot is the one a person there would mean', () => {
  // Three made-up buildings along a street near Udupi, as [lat, lon] corners.
  // One degree of latitude is about 111 km, so 0.0001 is about 11 metres.
  const square = (lat: number, lon: number, size: number): Ring => [
    [lat, lon],
    [lat, lon + size],
    [lat + size, lon + size],
    [lat + size, lon],
  ];
  const house: Outline = { ring: square(13.34, 74.75, 0.0001), source: 'google' };
  const neighbour: Outline = { ring: square(13.34, 74.7503, 0.0001), source: 'google' };
  const compound: Outline = { ring: square(13.3399, 74.7499, 0.0004), source: 'osm' };
  const shed: Outline = { ring: square(13.34005, 74.75015, 0.00002), source: 'microsoft' };

  assert.equal(insideRing([13.34005, 74.75005], house.ring), true);
  assert.equal(insideRing([13.34005, 74.7502], house.ring), false);
  assert.equal(distanceToRingM([13.34005, 74.75005], house.ring), 0);
  // About 11 metres east of the house's east wall.
  const off = distanceToRingM([13.34005, 74.7502], house.ring);
  assert.ok(off > 9 && off < 13, `distance was ${off}`);

  // Standing inside the house: the house wins over the compound that also contains the spot.
  assert.equal(chooseBuilding([13.34005, 74.75005], [compound, neighbour, house], 30)?.ring, house.ring);
  // Standing in the lane between two houses: the nearer one.
  assert.equal(chooseBuilding([13.34005, 74.75022], [house, neighbour], 30)?.ring, neighbour.ring);
  // A shed is too small to be anyone's roof, even when it is the nearest thing.
  assert.equal(chooseBuilding([13.34006, 74.75016], [shed, house], 30)?.ring, house.ring);
  // Nothing within reach means nothing found, not a guess from down the road.
  assert.equal(chooseBuilding([13.35, 74.76], [house, neighbour], 30), undefined);
  const picked = chooseBuilding([13.34005, 74.75005], [house], 30);
  assert.ok(picked && picked.areaM2 > 100 && picked.areaM2 < 135, `area was ${picked?.areaM2}`);

  // A tap points at a building. A device's own location is trusted only as far as it claims.
  assert.equal(searchRadiusM('tap'), 15);
  assert.equal(searchRadiusM('device', 8), 20);
  assert.equal(searchRadiusM('device', 35), 35);
  assert.equal(searchRadiusM('device', 900), 60);

  // Live location. The first report of a call always moves the home: where the person is now
  // wins over a place left from an earlier call.
  assert.equal(shouldFollow({ first: true, following: false, movedM: 0 }), true);
  // Later reports move it only when the device has really moved…
  assert.equal(shouldFollow({ first: false, following: true, movedM: 8 }), false);
  assert.equal(shouldFollow({ first: false, following: true, movedM: 60 }), true);
  // …and never once the person has named a place or picked a building themselves.
  assert.equal(shouldFollow({ first: false, following: false, movedM: 600 }), false);
  const walked = metresBetween({ lat: 12.9719, lon: 77.6412 }, { lat: 12.9724, lon: 77.6415 });
  assert.ok(walked > 55 && walked < 70, `walked ${walked}`);
});

test('panels are drawn on the roof, inside it, without overlapping', () => {
  // A flat roof 14 m by 9 m near Udupi, turned 25 degrees from north, as [lat, lon] corners.
  const lat0 = 13.34;
  const lon0 = 74.75;
  const east = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  const turn = (25 * Math.PI) / 180;
  const corner = (x: number, y: number): [number, number] => [lat0 + (x * Math.sin(turn) + y * Math.cos(turn)) / 111_320, lon0 + (x * Math.cos(turn) - y * Math.sin(turn)) / east];
  const roof: Ring = [corner(0, 0), corner(14, 0), corner(14, 9), corner(0, 9)];
  const area = polygonAreaM2(roof);
  assert.ok(area > 122 && area < 130, `area was ${area}`);

  // The count comes from the sizing maths; the drawing has to find room for exactly that many.
  const count = roofCapacity(area, 0.1).panels;
  assert.equal(count, 18);
  const panels = layoutPanels(roof, count);
  assert.equal(panels.length, count);

  for (const panel of panels) {
    assert.equal(panel.length, 4);
    for (const point of panel) assert.ok(insideRing(point, roof), 'a panel corner is off the roof');
    // Each drawn panel is the size of a real one: about 1.13 m by 2.28 m.
    const size = polygonAreaM2(panel);
    assert.ok(size > 2.45 && size < 2.7, `a panel measured ${size} m2`);
  }
  // No panel sits on another: no corner of one lies inside a different one.
  for (const a of panels) for (const b of panels) if (a !== b) for (const point of a) assert.equal(insideRing(point, b), false);

  // Asking for fewer gives fewer, and nothing is drawn on a roof with no outline.
  assert.equal(layoutPanels(roof, 5).length, 5);
  assert.equal(layoutPanels(roof, 0).length, 0);
  assert.equal(layoutPanels([], 10).length, 0);
  // A roof too small for the count returns what fits rather than drawing off the edge.
  const shed: Ring = [corner(0, 0), corner(3, 0), corner(3, 3), corner(0, 3)];
  const onShed = layoutPanels(shed, 10);
  assert.ok(onShed.length >= 1 && onShed.length < 10, `the shed took ${onShed.length}`);
  for (const panel of onShed) for (const point of panel) assert.ok(insideRing(point, shed));
  // A huge roof is drawn in a fixed number of blocks, each standing for several panels, and
  // the blocks still cover the roof. The number on screen says how many panels fit.
  const hall: Ring = [corner(0, 0), corner(120, 0), corner(120, 90), corner(0, 90)];
  const hallCount = roofCapacity(polygonAreaM2(hall), 0.1).panels;
  assert.ok(hallCount > 1000, `the hall takes ${hallCount}`);
  const blocks = layoutPanels(hall, hallCount);
  assert.equal(blocks.length, MOST_PANELS_DRAWN);
  for (const block of blocks) for (const point of block) assert.ok(insideRing(point, hall), 'a block is off the hall');
  const covered = blocks.reduce((sum, block) => sum + polygonAreaM2(block), 0);
  assert.ok(Math.abs(covered - hallCount * 2.58) < hallCount * 0.15, `blocks cover ${Math.round(covered)} m2 for ${hallCount} panels`);
});

test('the satellite view asks for no closer picture than exists', async () => {
  // The tile that holds Udupi at level 18, as the imagery service numbers it.
  assert.deepEqual(tileAt(13.3409, 74.7421, 18), { x: 185497, y: 121268 });
  assert.deepEqual(tileAt(0, 0, 1), { x: 1, y: 1 });

  // A town with pictures down to level 18 only: the two closest levels are missing.
  const asked: string[] = [];
  const town = (async (url: string | URL | Request) => {
    asked.push(String(url));
    const level = Number(String(url).split('/tilemap/')[1].split('/')[0]);
    return new Response(JSON.stringify({ valid: true, data: [level <= 18 ? 1 : 0] }));
  }) as typeof fetch;
  forgetImagery();
  assert.equal(await deepestImagery(13.3409, 74.7421, town), 18);
  assert.equal(asked.length, 2);
  assert.match(asked[1], /\/tilemap\/18\/121268\/185497\/1\/1$/);
  // The answer is remembered for the neighbourhood, so the service is not asked again.
  assert.equal(await deepestImagery(13.341, 74.7422, town), 18);
  assert.equal(asked.length, 2);

  // If the service cannot be reached, fall back to a level that exists almost everywhere.
  forgetImagery();
  const offline = (async () => {
    throw new Error('offline');
  }) as typeof fetch;
  assert.equal(await deepestImagery(13.3409, 74.7421, offline), SAFE_ZOOM);
  forgetImagery();
});

test('what was said survives an agent restart', () => {
  // Agora's record of a conversation, in the shape its history call returns it.
  const history = [
    { role: 'assistant', content: "Hi, I'm Dhoop." },
    { role: 'user', content: 'My name is Meera and my bill is 3000 rupees.' },
    { role: 'assistant' }, // a tool call: no words
    { role: 'tool', content: '{"ok": true, "monthly_units": 429}' },
    { role: 'assistant', content: '  Thank you,\n Meera!  ' },
    { role: 'user', content: [{ type: 'text', text: 'Here is my roof.' }, { type: 'image_url', image_url: { url: 'data:…' } }] },
    { role: 'system', content: 'not a turn' },
  ];
  const turns = turnsFromHistory(history);
  assert.deepEqual(turns, [
    { role: 'assistant', text: "Hi, I'm Dhoop." },
    { role: 'user', text: 'My name is Meera and my bill is 3000 rupees.' },
    { role: 'assistant', text: 'Thank you, Meera!' },
    { role: 'user', text: 'Here is my roof.' },
  ]);
  assert.deepEqual(turnsFromHistory('nonsense'), []);
  assert.equal(turnsFromHistory([{ role: 'user', content: 'x'.repeat(900) }])[0].text.length, 280);

  resetStore();
  const sid = 'memory-test';
  assert.equal(hasMemory(ensureSession(sid)), false);
  assert.equal(conversationSoFar(sid), '');

  // The first agent's words are saved when it stops. Saving it twice must not repeat them.
  assert.equal(rememberTurns(sid, 'agent-1', turns), 4);
  assert.equal(rememberTurns(sid, 'agent-1', turns), 4);
  assert.equal(hasMemory(getSession(sid)), true);
  // A second agent (after a language change) adds to the first one's words.
  assert.equal(rememberTurns(sid, 'agent-2', [{ role: 'user', text: 'नमस्ते' }, { role: 'assistant', text: 'जी, बताइए।' }]), 6);
  assert.equal(rememberTurns(sid, 'agent-2', [{ role: 'user', text: 'नमस्ते' }, { role: 'assistant', text: 'जी, बताइए।' }, { role: 'user', text: 'ठीक है' }]), 7);
  assert.equal(conversationSoFar(sid, 3), 'Person: नमस्ते\nDhoop: जी, बताइए।\nPerson: ठीक है');
  assert.match(conversationSoFar(sid), /^Dhoop: Hi, I'm Dhoop\.\nPerson: My name is Meera/);

  // Memory is capped, keeping the most recent words.
  const many = Array.from({ length: 60 }, (_, i) => ({ role: 'user' as const, text: `line ${i}` }));
  assert.equal(rememberTurns(sid, 'agent-3', many), MAX_TURNS);
  assert.equal(getSession(sid)?.turns?.at(-1)?.text, 'line 59');
  assert.equal(sessionOfAgent('nobody'), undefined);

  // The next agent is told what was said, and told not to start over.
  const fresh = systemPrompt('hi', { toolsOn: true, cameraOn: false, brief: 'Bill: 429 units a month.' });
  assert.doesNotMatch(fresh, /What was said earlier/);
  const carried = systemPrompt('hi', { toolsOn: true, cameraOn: false, brief: 'Bill: 429 units a month.', earlier: 'Person: My name is Meera.' });
  assert.match(carried, /# What was said earlier[\s\S]*Person: My name is Meera\./);
  assert.match(carried, /Never ask again for something the person has already told you/);
});

test('the dive down to a roof knows which pictures it will pass', () => {
  // A view the size of the stage, from most of the country down to rooftop level in Bengaluru.
  const tiles = diveTiles(12.9719, 77.6412, 5, 19, { x: 700, y: 352 });
  // Every level on the way is there, and each has the tile that holds the spot itself.
  for (let z = 6; z <= 19; z++) {
    const here = tileAt(12.9719, 77.6412, z);
    assert.ok(tiles.some((t) => t.z === z && t.x === here.x && t.y === here.y), `level ${z} lacks the tile of the spot`);
  }
  assert.equal(tiles.some((t) => t.z <= 5 || t.z > 19), false);
  // Few enough to fetch in the moment before the dive starts, and none twice.
  assert.ok(tiles.length >= 14 * 4 && tiles.length <= 14 * 12, `${tiles.length} tiles`);
  assert.equal(new Set(tiles.map((t) => `${t.z}/${t.x}/${t.y}`)).size, tiles.length);
  // Nothing to fetch when the view is already as close as it goes.
  assert.equal(diveTiles(12.9719, 77.6412, 19, 19, { x: 700, y: 352 }).length, 0);
});

test('a building asked for by name is told from the bus stop outside it', () => {
  const hit = (name: string, kind: string, rank = 30, town = 'Kochi'): PlaceHit => ({ name, town, lat: 10, lon: 76, rank, halfSpanM: 8, kind });
  // What the lookup really returned for "Lulu Mall, Kochi": a bus stop in another city first.
  const lulu = [hit('Lulu mall', 'highway/bus_stop', 30, 'Thiruvananthapuram'), hit('LuLu International Shopping Mall, Kochi', 'shop/mall'), hit('LuLu Mall, Kochi', 'landuse/retail', 24)];
  assert.equal(pickNamed(lulu)?.kind, 'shop/mall');
  // A station is still found when a station is all there is.
  assert.equal(pickNamed([hit('Indiranagar', 'railway/station')])?.name, 'Indiranagar');
  // A town beats its district, as for any place.
  assert.equal(pickNamed([hit('Udupi', 'boundary/administrative', 10), hit('Udupi', 'place/city', 16)])?.rank, 16);
  assert.equal(pickNamed([]), undefined);

  // A match is under the asked name give or take spelling, or it is only something at that address.
  assert.equal(sameName('Vidhan Soudha Bangalore', 'Vidhana Soudha'), true);
  assert.equal(sameName('Lulu Mall', 'LuLu International Shopping Mall, Kochi'), true);
  assert.equal(sameName('Phoenix Marketcity', 'Puma'), false);

  // How far to look for the building, by what the name matched.
  assert.deepEqual(namedReach({ rank: 30, halfSpanM: 8 }), { withinM: 40, exact: true }); // a temple marked as a point
  assert.deepEqual(namedReach({ rank: 30, halfSpanM: 154 }), { withinM: 120, exact: true }); // Vidhana Soudha
  assert.deepEqual(namedReach({ rank: 30, halfSpanM: 1221 }), { withinM: 150, exact: false }); // a university campus
  assert.deepEqual(namedReach({ rank: 24, halfSpanM: 933 }), { withinM: 150, exact: false }); // a tech park
  assert.equal(namedReach({ rank: 19, halfSpanM: 3109 }), null); // a suburb: no one building

  // The grounds of a palace come first; the building of the same name within them is what was asked for.
  const grounds = { ...hit('Mysore Palace', 'historic/castle', 30, 'Mysuru'), halfSpanM: 444 };
  const palace = { ...hit('Mysore Palace', 'building/yes', 30, 'Mysuru'), ring: [[10, 76], [10.001, 76], [10.001, 76.001]] as [number, number][] };
  assert.equal(pickNamed([grounds, palace])?.kind, 'building/yes');

  // Which building a name stands for. Each list is what the building data really holds there: metres away, square metres.
  const at = (distanceM: number, areaM2: number) => ({ ring: [] as [number, number][], source: 'test', distanceM, areaM2 });
  // Mysore Palace: a kiosk is nearest to the middle of the grounds, the palace is the large one further in.
  assert.equal(chooseNamedBuilding([at(58, 84), at(64, 216), at(95, 1217), at(121, 2704)], 150, false)?.areaM2, 2704);
  // A mall drawn in pieces, whose middle falls beside its smallest piece.
  assert.equal(chooseNamedBuilding([at(4, 140), at(14, 2392), at(30, 2326)], 120, false)?.areaM2, 2392);
  // A temple marked as a point: the building that holds the point, not the bigger hall next door.
  assert.equal(chooseNamedBuilding([at(0, 568), at(14, 744), at(16, 895)], 40, true)?.areaM2, 568);
  assert.equal(chooseNamedBuilding([], 40, true), undefined);
  // A science park marked as a point that falls inside a scrap of roof drawn apart from its building: the building, a step away.
  assert.equal(chooseNamedBuilding([at(0, 36), at(0.3, 351), at(14, 38), at(52, 309)], 150, true)?.areaM2, 351);
  // The same for a device standing there. A small outline with nothing much bigger against it is kept: some homes are small.
  const scrap = at(0, 36);
  assert.equal(wholeBuilding(scrap, [scrap, at(0.3, 351), at(14, 38)]).areaM2, 351);
  assert.equal(wholeBuilding(scrap, [scrap, at(3, 80), at(30, 900)]).areaM2, 36);
  const home = at(0, 95);
  assert.equal(wholeBuilding(home, [home, at(1, 600)]).areaM2, 95);

  // The agent has a tool for it, and the tool refuses an empty name without asking anyone.
  const tool = findTool('findBuilding');
  assert.deepEqual(Object.keys(tool!.properties), ['place']);
});

test('the recogniser is told which names to expect, and never the one that stops it', () => {
  for (const lang of LANG_ORDER) {
    const words = hotwords(lang, ['Brahmagiri, Udupi', undefined, 'Sri Krishna Temple Udupi']);
    // A short list: a long one made the recogniser fail to start in half the test calls. Agora's own limit is 128.
    assert.equal(words.length, SAFE_HOTWORDS);
    const all = hotwords(lang, [], MOST_HOTWORDS);
    assert.ok(all.length > 60 && all.length <= MOST_HOTWORDS, `${lang} has ${all.length} in all`);
    assert.equal(all.includes('Patna'), false);
    // Agora's advice: no short words, nothing twice.
    assert.ok(words.every((w) => w.length >= 3));
    assert.equal(new Set(words.map((w) => w.toLowerCase())).size, words.length);
    // What the conversation has already named comes first.
    assert.deepEqual(words.slice(0, 3), ['Brahmagiri', 'Udupi', 'Sri Krishna Temple Udupi']);
    // "Patna" made the engine answer "The speech recognition service failed" for whole calls.
    assert.equal(words.includes('Patna'), false);
    assert.ok(words.includes('Vidhana Soudha') && words.includes('Tumakuru'));
  }
  // Another language also gets the names in its own script, as Agora advises.
  assert.ok(hotwords('hi').includes('विधान सौधा') && hotwords('kn').includes('ವಿಧಾನಸೌಧ') && hotwords('en').includes('Lulu Mall'));
  assert.equal(hotwords('en').some((w) => /[^\x20-\x7e]/.test(w)), false);
  // Deepgram does best with a shorter list, written the way the language writes them.
  assert.ok(keyterms('ml').length <= 50 && keyterms('ml').includes('കൊച്ചി'));
});

test('the subsidy application is checked, tracked and remembered', async () => {
  const sid = 'apply-session';
  ensureSession(sid, 'hi');
  const call = async (name: string, args: Record<string, unknown>) => (await findTool(name)!.run(sid, args)) as Record<string, unknown>;

  // The portal sets out ten stages. A household whose bank account is in another name is told what to put right, not turned away.
  assert.equal(SUBSIDY_STEPS.length, 10);
  const asked = await call('checkEligibility', { is_a_home: 'yes', connection_in_own_name: 'yes', bank_account_same_name: 'no', roof_is_theirs_to_use: 'maybe' });
  assert.match(String(asked.verdict), /put right/);
  assert.equal((asked.put_right_first as string[]).length, 1);
  assert.match((asked.put_right_first as string[])[0], /undertaking/);
  // Anything that is not a plain yes or no counts as not known yet.
  assert.equal((asked.still_to_find_out as string[]).length, 1);
  assert.equal(eligibilityVerdict({ home: 'yes', name: 'yes', bank: 'yes', roof: 'yes' }).verdict, 'ready');
  assert.equal(eligibilityVerdict({ home: 'yes', name: 'unknown', bank: 'yes', roof: 'yes' }).verdict, 'check');

  // Stages: the next one is named, with who has to act.
  const steps = await call('subsidySteps', { last_stage_done: 0 });
  assert.equal(steps.stages_in_all, 10);
  assert.equal(steps.stages_done, 0);
  assert.deepEqual([(steps.next_stage as { number: number }).number, (steps.next_stage as { who_acts: string }).who_acts], [1, 'you']);
  assert.match(String(steps.warning), /OTP/);
  const moved = await call('subsidySteps', { last_stage_done: '3' });
  assert.equal(moved.stages_done, 3);
  assert.equal((moved.next_stage as { name: string }).name, 'Choose a vendor');
  // Asking again without saying anything new, or with "not started", does not wipe what is remembered.
  assert.equal((await call('subsidySteps', { last_stage_done: -1 })).stages_done, 3);
  assert.equal((await call('subsidySteps', { last_stage_done: 0 })).stages_done, 3);
  // A stage the person names is taken as said, forwards or back, and never past the last.
  assert.equal((await call('subsidySteps', { last_stage_done: 99 })).stages_done, 10);
  assert.equal((await call('subsidySteps', { last_stage_done: 3 })).stages_done, 3);
  // What was asked is kept when a stage is marked, and the next agent is told where they stand.
  assert.equal(getSession(sid)!.application!.eligibility!.bank, 'no');
  assert.match(sessionBrief(sid), /3 of 10 stages done, next is "Choose a vendor"/);
  assert.match(sessionBrief(sid), /something to put right first/);

  // The scheme's loan. It needs a design, and the instalment is ordinary loan arithmetic.
  assert.equal((await call('loanPlan', { years: 5 })).ok, false);
  assert.ok(Math.abs(monthlyInstalment(100_000, 6, 60) - 1933.28) < 0.01);
  assert.equal(monthlyInstalment(60_000, 0, 60), 1000);
  await call('saveBill', { monthly_units: 310, bill_amount: 3200, source: 'spoken' });
  await call('designSolar', { target_kw: 0 });
  const design = getSession(sid)!.design!;
  const loan = await call('loanPlan', { years: 5 });
  assert.equal(loan.loan_rupees, Math.min(200_000, Math.round(design.grossCost * 0.9)));
  assert.equal((loan.you_pay_first_rupees as number) + (loan.loan_rupees as number), design.grossCost);
  assert.equal(loan.instalment_per_month_rupees, Math.round(monthlyInstalment(loan.loan_rupees as number, 6, 60)));
  assert.ok((loan.instalment_if_subsidy_is_paid_into_the_loan_rupees as number) < (loan.instalment_per_month_rupees as number));
  // With no preference, the shortest loan the saving on the bill pays for.
  const chosen = await call('loanPlan', { years: 0 });
  assert.ok((chosen.instalment_per_month_rupees as number) <= design.monthlySavings, `instalment ${chosen.instalment_per_month_rupees} against saving ${design.monthlySavings}`);
  assert.ok(monthlyInstalment(chosen.loan_rupees as number, 6, ((chosen.years as number) - 1) * 12) > design.monthlySavings, 'a year shorter would cost more than is saved');
  // No more than ten years, whatever is asked for.
  assert.equal((await call('loanPlan', { years: 40 })).years, 10);
  assert.match(sessionBrief(sid), /Loan worked out/);
});

test('the passbook speaks every language, and only says what the session holds', async () => {
  const words = Object.keys(PASSBOOK.en).sort();
  for (const lang of LANG_ORDER) {
    assert.deepEqual(Object.keys(PASSBOOK[lang]).sort(), words, `${lang} is missing a word`);
    assert.ok(Object.values(PASSBOOK[lang]).every((w) => w.trim().length > 0));
  }
  // Nothing to read out before there is a roof or a system.
  const sid = 'passbook-session';
  ensureSession(sid, 'ml');
  assert.equal(voiceNote(getSession(sid)!), null);
  const call = async (name: string, args: Record<string, unknown>) => (await findTool(name)!.run(sid, args)) as Record<string, unknown>;
  await call('saveBill', { monthly_units: 310, bill_amount: 3200, source: 'spoken' });
  await call('designSolar', { target_kw: 0 });
  for (const lang of LANG_ORDER) {
    updateSession(sid, (s) => {
      s.lang = lang;
    });
    const note = voiceNote(getSession(sid)!)!;
    const d = getSession(sid)!.design!;
    // The system's size and the subsidy are in it, in figures a voice can say, and the warning about OTPs.
    assert.ok(note.text.includes(String(d.kw)) && note.text.includes(Math.round(d.subsidy / 100) * 100 >= 1000 ? (Math.round(d.subsidy / 100) * 100).toLocaleString('en-IN') : String(d.subsidy)), `${lang}: ${note.text.slice(0, 80)}`);
    assert.ok(note.text.length > 150 && note.text.length < 1200);
    assert.match(note.locale, /-IN$/);
  }
  // Malayalam has a voice of its own, as in the conversation.
  assert.equal(voiceNote(getSession(sid)!)!.voiceId, 'ml-IN-nimisha');
});

test('saving a key changes only its own line', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dhoop-env-'));
  try {
    writeFileSync(join(dir, '.env.local'), '# keys\nMURF_API_KEY=\nOTHER=keep me\n');
    writeEnv({ MURF_API_KEY: 'abc$1&x', NEW_ONE: 'v' }, dir);
    assert.equal(readFileSync(join(dir, '.env.local'), 'utf8'), '# keys\nMURF_API_KEY=abc$1&x\nOTHER=keep me\nNEW_ONE=v\n');
    assert.throws(() => writeEnv({ MURF_API_KEY: 'a\nINJECTED=1' }, dir));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// A spot in Bengaluru, and metres east and north of it, for drawing test roofs.
const ROOF_LAT = 12.97;
const ROOF_LON = 77.59;
const ROOF_KX = 111_320 * Math.cos((ROOF_LAT * Math.PI) / 180);
const roofAt = (x: number, y: number): [number, number] => [ROOF_LAT + y / 111_132, ROOF_LON + x / ROOF_KX];
const roofXY = (p: [number, number]): [number, number] => [(p[1] - ROOF_LON) * ROOF_KX, (p[0] - ROOF_LAT) * 111_132];

test('a roof grows on the side asked for, by the area asked for', () => {
  // A plain house roof: 10 m east to west, 8 m north to south.
  const house: Ring = [roofAt(0, 0), roofAt(10, 0), roofAt(10, 8), roofAt(0, 8)];
  const grown = reshapeRing(house, 'add', 'right', 40);
  assert.ok(grown);
  assert.equal(grown.ring.length, 4, 'a rectangle stays a rectangle');
  assert.ok(Math.abs(polygonAreaM2(grown.ring) - 120) < 0.5);
  const xs = grown.ring.map((p) => roofXY(p)[0]);
  assert.ok(Math.abs(Math.max(...xs) - 15) < 0.05, 'the east wall moved out by 5 m');
  assert.ok(Math.abs(Math.min(...xs)) < 0.05, 'the west wall stayed');
  assert.equal(grown.facing, 'east');
  assert.ok(Math.abs((grown.movedM ?? 0) - 5) < 0.01);
  for (const [side, facing] of [['left', 'west'], ['top', 'north'], ['bottom', 'south']] as const) {
    const g = reshapeRing(house, 'add', side, 40);
    assert.equal(g?.facing, facing);
    assert.equal(g?.ring.length, 4);
    assert.ok(Math.abs(polygonAreaM2(g!.ring) - 120) < 0.5);
  }

  // A building that stands at an angle grows along its own walls and keeps its square corners.
  const turn = (30 * Math.PI) / 180;
  const turned: Ring = house.map((p) => {
    const [x, y] = roofXY(p);
    return roofAt(x * Math.cos(turn) - y * Math.sin(turn), x * Math.sin(turn) + y * Math.cos(turn));
  });
  const t = reshapeRing(turned, 'add', 'right', 40);
  assert.ok(t);
  assert.equal(t.ring.length, 4);
  assert.ok(Math.abs(polygonAreaM2(t.ring) - 120) < 0.5);
  const q = t.ring.map(roofXY);
  for (let i = 0; i < 4; i++) {
    const [a, b, c] = [q[i], q[(i + 1) % 4], q[(i + 2) % 4]];
    assert.ok(Math.abs((b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1])) < 0.05, 'corners stay square');
  }
  assert.equal(t.facing, 'north-east');

  // An L-shaped roof keeps its shape and gains exactly what was asked.
  const ell: Ring = [roofAt(0, 0), roofAt(12, 0), roofAt(12, 5), roofAt(5, 5), roofAt(5, 10), roofAt(0, 10)];
  const e = reshapeRing(ell, 'add', 'top', 30);
  assert.ok(e);
  assert.equal(e.ring.length, 6);
  assert.ok(Math.abs(polygonAreaM2(e.ring) - 115) < 0.5);
  // The same roof listed clockwise gives the same answer.
  const clockwise = reshapeRing([...ell].reverse(), 'add', 'top', 30);
  assert.ok(clockwise && Math.abs(polygonAreaM2(clockwise.ring) - 115) < 0.5);
});

test('a part of a roof is left out, and a roof grows all round', () => {
  const house: Ring = [roofAt(0, 0), roofAt(10, 0), roofAt(10, 8), roofAt(0, 8)];
  const cut = reshapeRing(house, 'remove', 'left', 20);
  assert.ok(cut);
  assert.ok(Math.abs(polygonAreaM2(cut.ring) - 60) < 0.3);
  const xs = cut.ring.map((p) => roofXY(p)[0]);
  assert.ok(Math.abs(Math.min(...xs) - 2.5) < 0.05, 'the west wall moved in by 2.5 m');
  assert.ok(Math.abs(Math.max(...xs) - 10) < 0.05, 'the east wall stayed');
  assert.equal(cut.facing, 'west');

  // All round: the same shape about the same middle. 80 to 115.2 square metres is every wall 1.2 times as long.
  const all = reshapeRing(house, 'add', 'all_round', 35.2);
  assert.ok(all);
  assert.ok(Math.abs(polygonAreaM2(all.ring) - 115.2) < 0.3);
  const [midLat, midLon] = middleOf(all.ring);
  const [wasLat, wasLon] = middleOf(house);
  assert.ok(Math.abs(midLat - wasLat) < 1e-7 && Math.abs(midLon - wasLon) < 1e-7);
  const wide = all.ring.map((p) => roofXY(p)[0]);
  assert.ok(Math.abs(Math.max(...wide) - Math.min(...wide) - 12) < 0.05);

  // Nothing is drawn when nothing would be left, or nothing was asked.
  assert.equal(reshapeRing(house, 'remove', 'left', 80), null);
  assert.equal(reshapeRing(house, 'remove', 'all_round', 500), null);
  assert.equal(reshapeRing(house, 'add', 'right', 0), null);
});

test('the next building over is the neighbour, not the one beyond it or across the road', () => {
  const box = (x: number, y: number): Ring => [roofAt(x, y), roofAt(x + 8, y), roofAt(x + 8, y + 8), roofAt(x, y + 8)];
  const here = box(0, 0);
  const others = [
    { ring: box(0.5, 0.5), name: 'the same building, as another map drew it' },
    { ring: box(11, 1), name: 'right' },
    { ring: box(22, 0), name: 'two to the right' },
    { ring: box(-11, 0), name: 'left' },
    { ring: box(13, 20), name: 'across the road' },
    { ring: box(1, 14), name: 'behind' },
  ];
  assert.equal(neighbourIn(here, others, 'right')?.building.name, 'right');
  assert.equal(neighbourIn(here, others, 'left')?.building.name, 'left');
  assert.equal(neighbourIn(here, others, 'top')?.building.name, 'behind');
  assert.equal(neighbourIn(here, others, 'bottom'), undefined);
  assert.equal(Math.round(neighbourIn(here, others, 'right')!.metresAway), 11);
});

test('the roof is changed by voice, the system follows it, and every change can be undone', async () => {
  resetStore();
  const sid = 'voice-roof';
  const call = async (name: string, args: Record<string, unknown>) => (await findTool(name)!.run(sid, args)) as Record<string, unknown>;
  // A small roof that Dhoop found, holding back a large bill.
  const house: Ring = [roofAt(0, 0), roofAt(6, 0), roofAt(6, 5), roofAt(0, 5)];
  const cap = roofCapacity(30, 0.1);
  ensureSession(sid);
  updateSession(sid, (s) => {
    s.location = { label: 'Indiranagar, Bengaluru', lat: ROOF_LAT, lon: ROOF_LON, sunHours: 5.3, monthly: [], source: 'nasa' };
    s.roof = { areaM2: 30, shadeFraction: 0.1, usableM2: cap.usableM2, capacityKw: cap.kw, panelsFit: cap.panels, source: 'found', foundBy: 'device', name: 'Indiranagar, Bengaluru', polygon: house };
    s.followDevice = true;
  });
  await call('saveBill', { monthly_units: 600, bill_amount: 6000, source: 'spoken' });
  const first = await call('designSolar', { target_kw: 0 });
  assert.equal(first.limited_by_roof, true);

  const grown = await call('changeRoof', { change: 'add', side: 'right', amount: 60, unit: 'square_metres' });
  assert.equal(grown.ok, true);
  assert.equal(grown.roof_area_square_metres, 90);
  assert.ok((grown.panels_that_fit as number) > (grown.panels_before as number));
  assert.equal(grown.system_size_changed, true);
  let s = getSession(sid)!;
  assert.equal(s.roof!.foundBy, 'voice');
  assert.equal(s.roof!.name, 'Indiranagar, Bengaluru');
  assert.equal(s.followDevice, false, 'the device no longer moves the home');
  assert.ok(s.design!.kw > (first.system_kw as number), 'the system grew into the new room');
  assert.equal(s.roofSteps!.length, 1);

  // Square feet and shares of the roof are worked out by the tool, never by the model.
  assert.equal((await call('changeRoof', { change: 'remove', side: 'left', amount: 215, unit: 'square_feet' })).roof_area_square_metres, 70);
  assert.equal((await call('changeRoof', { change: 'remove', side: 'right', amount: 50, unit: 'percent' })).roof_area_square_metres, 35);

  // Undo, one change at a time, back to the roof as it was found.
  assert.equal((await call('undoRoofChange', { reason: 'test' })).roof_area_square_metres, 70);
  assert.equal((await call('undoRoofChange', { reason: 'test' })).roof_area_square_metres, 90);
  assert.equal((await call('undoRoofChange', { reason: 'test' })).roof_area_square_metres, 30);
  s = getSession(sid)!;
  assert.deepEqual(s.roof!.polygon, house);
  assert.equal(s.roof!.foundBy, 'device');
  assert.equal(s.design!.kw, first.system_kw);
  assert.equal((await call('undoRoofChange', { reason: 'test' })).ok, false, 'nothing more to undo');

  // A roof found afresh has nothing to undo, whatever steps an earlier roof left behind.
  await call('changeRoof', { change: 'add', side: 'top', amount: 10, unit: 'square_metres' });
  updateSession(sid, (x) => {
    x.roof = { ...x.roof!, areaM2: 55, polygon: [roofAt(50, 50), roofAt(60, 50), roofAt(60, 55.5), roofAt(50, 55.5)] };
  });
  assert.equal((await call('undoRoofChange', { reason: 'test' })).ok, false);
  assert.equal(roofMark(getSession(sid)!.roof) === roofMark(undefined), false);

  // Nothing silly is drawn.
  assert.equal((await call('changeRoof', { change: 'remove', side: 'left', amount: 100, unit: 'percent' })).ok, false);
  assert.equal((await call('changeRoof', { change: 'add', side: 'left', amount: 0, unit: 'square_metres' })).ok, false);
  assert.equal((await call('nextBuilding', { direction: 'sideways' })).ok, false);

  // A roof that was only told as a size has no outline to move, so only its size changes.
  await call('setRoofManual', { area_sqft: 1076.4, shade_percent: 10 });
  const told = await call('changeRoof', { change: 'add', side: 'right', amount: 50, unit: 'square_metres' });
  assert.equal(told.roof_area_square_metres, 150);
  assert.equal(getSession(sid)!.roof!.source, 'spoken');
  assert.equal(TOOLS.length, 28);

  // An outline that does not sit on the roof in the picture is slid over, the same shape and size, and can be slid back.
  const slid = shiftRing(house, 'top', 4);
  assert.ok(Math.abs(polygonAreaM2(slid) - polygonAreaM2(house)) < 0.01);
  assert.ok(Math.abs(roofXY(slid[0])[1] - 4) < 0.01 && Math.abs(roofXY(slid[0])[0]) < 0.01, 'four metres north, no further east');
  updateSession(sid, (x) => {
    x.roof = { areaM2: 30, shadeFraction: 0.1, usableM2: cap.usableM2, capacityKw: cap.kw, panelsFit: cap.panels, source: 'found', foundBy: 'device', polygon: house };
  });
  const moved = await call('moveRoof', { direction: 'right', distance: 10, unit: 'feet' });
  assert.equal(moved.ok, true);
  assert.equal(moved.moved_metres, 3);
  assert.equal(moved.roof_area_square_metres, 30);
  assert.ok(Math.abs(roofXY(getSession(sid)!.roof!.polygon![0])[0] - 3.048) < 0.01);
  assert.equal((await call('undoRoofChange', { reason: 'test' })).ok, true);
  assert.deepEqual(getSession(sid)!.roof!.polygon, house);
  assert.equal((await call('moveRoof', { direction: 'top', distance: 500, unit: 'metres' })).ok, false, 'too far to be a correction');
});

test('a recogniser that fails is left alone for a while, and the call changes to the other one', () => {
  forgetListeningTrouble();
  const t0 = 1_800_000_000_000;
  assert.equal(chooseListening('en', { now: t0 }), 'ares');
  assert.equal(chooseListening('ml', { now: t0 }), 'deepgram-terms', 'Malayalam has only Deepgram');
  // In the call where it failed, the other recogniser takes over.
  assert.equal(chooseListening('en', { failed: 'ares' }), 'deepgram-terms');
  assert.equal(chooseListening('hi', { failed: 'ares-few' }), 'deepgram-terms');
  assert.equal(chooseListening('en', { failed: 'deepgram-terms' }), 'ares-few');
  assert.equal(chooseListening('ml', { failed: 'deepgram-terms' }), 'deepgram');
  // And new calls stay off it for twenty minutes, then try it again.
  noteListeningFailed('ares', t0);
  assert.equal(chooseListening('en', { now: t0 + 60_000 }), 'deepgram-terms');
  assert.equal(chooseListening('kn', { now: t0 + TROUBLE_MS - 1 }), 'deepgram-terms');
  assert.equal(chooseListening('en', { now: t0 + TROUBLE_MS + 1 }), 'ares');
  // With both failing, the one that failed longer ago is tried: it has had longer to get well.
  noteListeningFailed('deepgram', t0 + 30_000);
  assert.equal(chooseListening('en', { now: t0 + 60_000 }), 'ares');
  noteListeningFailed('ares', t0 + 45_000);
  assert.equal(chooseListening('en', { now: t0 + 60_000 }), 'deepgram-terms');
  // A refused microphone gets the plainest setup, and a test gets the one it names, until it fails.
  forgetListeningTrouble();
  assert.equal(chooseListening('en', { plain: true }), 'ares-few');
  assert.equal(chooseListening('ml', { plain: true }), 'deepgram');
  assert.equal(chooseListening('en', { forced: 'deepgram' }), 'deepgram');
  assert.equal(chooseListening('en', { forced: 'ares', failed: 'ares' }), 'deepgram-terms');
  assert.equal(engineOf('deepgram-terms'), 'deepgram');
  assert.equal(engineOf('ares-few'), 'ares');
  for (const lang of LANG_ORDER) assert.ok(RECOVER_LINES[lang].length > 10, `${lang} has a line for coming back`);
});

test('a neighbourhood is added up with the same rules as one roof, and belongs to the home it was made around', async () => {
  const one = roofCapacity(100, 0.1);
  const all = streetTotals([100, 100, 100], { sunHours: 5.3, tariff: 8, monthlyUnits: 300 });
  assert.equal(all.roofs, 3);
  assert.equal(all.roofM2, 300);
  assert.equal(all.panels, one.panels * 3);
  assert.ok(Math.abs(all.kw - one.kw * 3) < 0.11);
  // The same yield a single design gets: units a year from the kilowatts and the sunshine.
  const design = designSystem({ monthlyUnits: 300, billAmount: 2400, sunHours: 5.3, targetKw: 5 });
  assert.ok(Math.abs(all.unitsAYear / (one.kw * 3) - design.annualGeneration / design.kw) < 2);
  // Worked out from the unrounded units, so allow for the rounding of each.
  assert.ok(Math.abs(all.rupeesAYear - all.unitsAYear * 8) <= 8);
  assert.ok(Math.abs((all.homesLikeThis ?? 0) - all.unitsAYear / 3600) <= 1);
  assert.ok(all.co2TonnesAYear > 0);
  // With no bill there is no "homes like yours", and the price of a unit is the stated default.
  const bare = streetTotals([100]);
  assert.equal(bare.homesLikeThis, undefined);
  assert.equal(bare.tariff, 7);

  // The neighbourhood stays while the home stays, and goes when the roof becomes another one.
  resetStore();
  const sid = 'street-home';
  const house: Ring = [roofAt(0, 0), roofAt(10, 0), roofAt(10, 8), roofAt(0, 8)];
  ensureSession(sid);
  updateSession(sid, (s) => {
    s.roof = { areaM2: 80, shadeFraction: 0.1, usableM2: 57.6, capacityKw: 6.19, panelsFit: 11, source: 'found', foundBy: 'device', polygon: house };
    s.street = { key: 'k1', lat: ROOF_LAT, lon: ROOF_LON, radiusM: 200, ...all };
  });
  assert.ok(getSession(sid)!.street, 'set together with the roof, it stays');
  await findTool('saveBill')!.run(sid, { monthly_units: 300, bill_amount: 2400, source: 'spoken' });
  await findTool('designSolar')!.run(sid, { target_kw: 0 });
  assert.ok(getSession(sid)!.street, 'a bill and a design leave it alone');
  await findTool('changeRoof')!.run(sid, { change: 'add', side: 'right', amount: 20, unit: 'square_metres' });
  assert.equal(getSession(sid)!.street, undefined, 'a changed roof leaves it stale, so it goes');
  assert.equal((await findTool('showNeighbourhood')!.run('street-nowhere', { radius_metres: 200 })).ok, false, 'nothing to add up before the home is placed');
});

test('a call left unused warns, then ends itself, and one in use never does', () => {
  const usual = quietLimits('');
  assert.deepEqual(usual, { afterMs: 240_000, warningMs: 30_000 });
  assert.equal(quietLeft(0, usual), null);
  assert.equal(quietLeft(239_000, usual), null, 'just under four minutes: nothing shows');
  assert.equal(quietLeft(240_000, usual), 30, 'the warning starts with thirty seconds on it');
  assert.equal(quietLeft(255_500, usual), 15);
  assert.equal(quietLeft(270_000, usual), 0, 'time to end');
  assert.equal(quietLeft(999_000, usual), 0);
  // A test may shorten it. The warning is never longer than the wait before it.
  assert.deepEqual(quietLimits('?quiet=0.1'), { afterMs: 6000, warningMs: 6000 });
  // Zero turns it off.
  assert.equal(quietLeft(9e9, quietLimits('?quiet=0')), null);
});

test('a place for a solar farm is compared on sun and land, sized, and left when the talk returns to the roof', () => {
  // A grid of spots over an area, and a closer look round one of them.
  const box = { south: 12, north: 13, west: 75, east: 76 };
  const grid = gridOver(box, 4);
  assert.equal(grid.length, 16);
  assert.deepEqual(grid[0], [12.125, 75.125]);
  assert.ok(grid.every(([lat, lon]) => withinRegion({ box }, lat, lon)));
  assert.equal(ringAround(12.5, 75.5, 0.1, 0.1).length, 8);
  // An area with a border of its own keeps only the spots inside it: here the south-west triangle of the box.
  const triangle = { box, rings: [[[12, 75], [13, 75], [12, 76]] as Ring] };
  assert.equal(withinRegion(triangle, 12.2, 75.2), true);
  assert.equal(withinRegion(triangle, 12.8, 75.8), false);

  // The sunniest few are within a hair of each other, so the land decides: open country first.
  const spot = (lat: number, yieldKwhPerKw: number, buildings?: number) => ({ lat, lon: 75.5, yieldKwhPerKw, sunHours: 5.5, buildings });
  const picks = pickSites([spot(12.1, 1640, 300), spot(12.3, 1632, 4), spot(12.5, 1628, 30), spot(12.7, 1635, 9), spot(12.301, 1631, 2)]);
  assert.deepEqual(picks.map((p) => p.yieldKwhPerKw), [1635, 1632, 1628], 'open and sunnier, then open, then scattered houses; the town last and left out');
  assert.equal(picks.some((p) => p.lat === 12.301), false, 'a spot a hundred metres from one already picked is the same place');
  assert.equal(pickSites([spot(12.1, 1640, 300)])[0].yieldKwhPerKw, 1640, 'a town is still an answer when there is nothing else');

  // One megawatt: four and a half acres, a square 135 metres a side, and the yield times a thousand kilowatts.
  const one = farmSize(1, 1600);
  assert.deepEqual({ acres: one.acres, sideM: one.sideM, unitsAYear: one.unitsAYear }, { acres: 4.5, sideM: 135, unitsAYear: 1_600_000 });
  assert.equal(farmSize(2, 1600).acres, 9);
  assert.equal(wayFrom({ lat: 12, lon: 75 }, { lat: 12.1, lon: 75 }), '11 km north');
  assert.match(wayFrom({ lat: 12, lon: 75 }, { lat: 12.05, lon: 75.05 }), /km north-east$/);

  // The screen stays on the site until the talk turns back to the roof, or the roof changes.
  resetStore();
  const sid = 'farm-site';
  const site = { key: 'k', capacityMw: 1, region: 'Tumakuru', compared: 25, ...one, picks: [{ name: 'Devalakere', lat: 14.1, lon: 77.3, yieldKwhPerKw: 1600, sunHours: 5.5 }], reasons: ['Sun'], notChecked: 'Land' };
  ensureSession(sid);
  updateSession(sid, (s) => {
    s.site = site;
  });
  beforeTool(sid, 'subsidySteps');
  assert.ok(getSession(sid)!.site, 'talk of the subsidy leaves it up');
  beforeTool(sid, 'findMyRoof');
  assert.equal(getSession(sid)!.site, undefined, 'asking for the roof takes the screen back');
  updateSession(sid, (s) => {
    s.site = site;
  });
  updateSession(sid, (s) => {
    s.roof = { areaM2: 80, shadeFraction: 0.1, usableM2: 57.6, capacityKw: 6.19, panelsFit: 11, source: 'found', foundBy: 'tap', polygon: [roofAt(0, 0), roofAt(10, 0), roofAt(10, 8), roofAt(0, 8)] };
  });
  assert.equal(getSession(sid)!.site, undefined, 'and so does a tap on a building');
});

test('the year is shown month by month, places are set side by side, and the passbook speaks another language', async () => {
  // A 3 kW system through a year with a wet July. Twelve months, the dip where the rain is.
  const sun = [5.6, 6.2, 6.6, 6.4, 5.9, 4.4, 3.8, 4.1, 4.9, 5.0, 4.9, 5.1];
  const year = throughTheYear(3, sun, 310);
  assert.ok(year);
  assert.equal(year.months.length, 12);
  assert.equal(year.best.name, 'March');
  assert.equal(year.poorest.name, 'July');
  assert.equal(year.poorest.made, Math.round(3 * 3.8 * 0.75 * 31));
  assert.equal(year.monthsShort, year.months.filter((m) => m.made < 310).length);
  assert.ok(year.monthsShort >= 1 && year.monthsShort < 12);
  // Over the year the months add up to what the design itself says the system makes.
  const design = designSystem({ monthlyUnits: 310, billAmount: 3200, sunHours: sun.reduce((a, b) => a + b, 0) / 12, targetKw: 3 });
  const total = year.months.reduce((a, m) => a + m.made, 0);
  assert.ok(Math.abs(total - design.annualGeneration) / design.annualGeneration < 0.02, `months ${total} against the design's ${design.annualGeneration}`);
  // No monthly figures (the national average was used), or a missing one: no chart, not a made-up one.
  assert.equal(throughTheYear(3, [], 310), null);
  assert.equal(throughTheYear(3, [...sun.slice(0, 11), -999], 310), null);

  // Places side by side: the best first, each with how far behind, and the reason in a sentence.
  const row = (label: string, yieldKwhPerKw: number, tempC: number) => ({ label, lat: 10, lon: 76, yieldKwhPerKw, sunHours: 5, tempC });
  const cmp = rankPlaces([row('Kochi', 1450, 27.5), row('Jaipur', 1700, 25.4), row('Bengaluru', 1620, 23.9)]);
  assert.deepEqual(cmp.rows.map((r) => r.label), ['Jaipur', 'Bengaluru', 'Kochi']);
  assert.equal(cmp.rows[0].behindPercent, 0);
  assert.equal(cmp.rows[2].behindPercent, 14.7);
  assert.match(cmp.reason, /^Jaipur is the better place: the same panels make about 17\.2% more there than in Kochi/);
  assert.match(cmp.reason, /cooler/);
  assert.match(rankPlaces([row('A', 1600, 25), row('B', 1595, 25)]).reason, /almost nothing between them/);

  // A call in English, and a passbook read out in Tamil for someone at home.
  resetStore();
  const sid = 'passbook-languages';
  const call = async (name: string, args: Record<string, unknown>) => (await findTool(name)!.run(sid, args)) as Record<string, unknown>;
  ensureSession(sid, 'en');
  updateSession(sid, (s) => {
    s.location = { label: 'Indiranagar, Bengaluru', lat: ROOF_LAT, lon: ROOF_LON, sunHours: 5.4, monthly: sun, source: 'nasa' };
  });
  await call('setRoofManual', { area_sqft: 900, shade_percent: 10 });
  await call('saveBill', { monthly_units: 310, bill_amount: 3200, source: 'spoken' });
  const designed = await call('designSolar', { target_kw: 0 });
  assert.match(String((designed.through_the_year as Record<string, unknown>).poorest_month), /^July, about \d+ units$/);
  const s = getSession(sid)!;
  assert.match(voiceNote(s)!.text, /^Hello\. This is Dhoop/);
  const tamil = voiceNote(s, 'ta')!;
  assert.match(tamil.text, /^வணக்கம்/);
  // The note is a sentence to a subject, which the solar story turns into scenes: here the home,
  // the roof, the system, the money and the caution, and no scene for an application not begun.
  assert.deepEqual(tamil.parts.map((p) => p.kind), ['hello', 'roof', 'system', 'money', 'close']);
  assert.equal(tamil.parts.map((p) => p.text).join(' '), tamil.text);
  // The story's telling is shorter: the last line keeps two sentences and leaves the caution to the screen.
  for (const l of LANG_ORDER) {
    const whole = voiceNote(s, l)!.parts.at(-1)!.text;
    const brief = voiceNote(s, l, true)!.parts.at(-1)!.text;
    assert.ok(brief.length > 20 && brief.length < whole.length * 0.75 && whole.startsWith(brief), `${l}: "${brief}"`);
  }
  // The story is played on request, and not before there is anything to tell.
  assert.equal(((await findTool('playSolarStory')!.run('story-nothing-yet', { reason: 'test' })) as Record<string, unknown>).ok, false);
  const played = await call('playSolarStory', { reason: 'test' });
  assert.equal(played.ok, true);
  assert.match(String(played.next), /Stay silent/);
  assert.match(getSession(sid)!.story!.key, /^story-/);
  assert.equal(tamil.locale, 'ta-IN');
  assert.equal(voiceNote(s, 'te')!.locale, 'te-IN');
});

test('a solar farm comes with its money and its vendors, and with what is not known said plainly', async () => {
  // One megawatt making 16.3 lakh units a year in Karnataka: the state's own price a unit.
  const ka = farmMoney(1, 1_630_000, 'Karnataka');
  assert.equal(ka.perUnit, 3.07);
  assert.equal(ka.perUnitRange, undefined);
  assert.equal(ka.earnsAYear, Math.round(1_630_000 * 3.07));
  assert.deepEqual(ka.cost, [3.5e7, 4.5e7]);
  assert.deepEqual(ka.payback, [7, 9]);
  // In a state whose own price was not found, a range is given and called a range.
  const kl = farmMoney(1, 1_578_000, 'Kerala');
  assert.deepEqual(kl.perUnitRange, [2.9, 3.1]);
  assert.equal(kl.perUnit, 3);
  assert.match(kl.perUnitWhat, /not found/);
  assert.deepEqual(farmMoney(2, 3_156_000, 'Kerala').cost, [7e7, 9e7]);

  // Vendors: a district's own list where it was read, the state's busiest otherwise, under the spellings a map uses.
  assert.deepEqual(VENDOR_DISTRICTS, ['Kasaragod', 'Bengaluru Urban']);
  assert.equal(vendorsFor('Kasaragod district')?.vendors.length, 6);
  assert.equal(vendorsFor('Bangalore Urban')?.place, 'Bengaluru Urban');
  assert.equal(vendorsFor('Kasaragod', 'Kerala')?.scope, 'district');
  const tumakuru = vendorsFor('Tumakuru', 'Karnataka');
  assert.equal(tumakuru?.scope, 'state', 'a district whose own list was not read gets its state list');
  assert.equal(tumakuru?.place, 'Karnataka');
  assert.equal(vendorsFor('Tumakuru'), undefined, 'with the state not known there is no list, not a guess');
  assert.equal(vendorsFor(undefined, 'Atlantis'), undefined);
  assert.equal(vendorsFor(undefined), undefined);
  // Every state and union territory has a list, under the names maps and people give them.
  assert.equal(VENDOR_STATES.length, 36);
  for (const [said, is] of [
    ['NCT of Delhi', 'Delhi'],
    ['Jammu & Kashmir', 'Jammu and Kashmir'],
    ['Orissa', 'Odisha'],
    ['Pondicherry', 'Puducherry'],
    ['tamil nadu', 'Tamil Nadu'],
    ['The Dadra and Nagar Haveli and Daman and Diu', 'Dadra and Nagar Haveli and Daman and Diu'],
    ['Andaman & Nicobar Islands', 'Andaman and Nicobar Islands'],
    ['Uttar Pradesh', 'Uttar Pradesh'],
    ['Uttarakhand', 'Uttarakhand'],
  ])
    assert.equal(vendorsFor(undefined, said)?.place, is, `${said} is ${is}`);
  for (const list of VENDOR_LISTS) {
    assert.ok(list.vendors.length >= 1 && list.vendors.length <= 6, `${list.place} has one to six vendors`);
    assert.equal(new Set(list.vendors.map((v) => v.phone)).size, list.vendors.length, `${list.place} lists no number twice`);
    for (const v of list.vendors) {
      assert.match(v.phone, /^[6-9]\d{9}$/, `${v.name} has a ten-digit number`);
      assert.ok(v.rating >= 0 && v.rating <= 5 && v.installs >= 1 && v.kwp >= 1, `${v.name} has sane figures`);
      assert.doesNotMatch(v.name, /\bprop?\b\.? /i, `${v.name} carries no proprietor's name`);
    }
  }
  // What goes on the screen is five, and a state's list says which district it was wanted for.
  const idukki = vendorsShown('Idukki', 'Kerala')!;
  assert.equal(idukki.scope, 'state');
  assert.equal(idukki.district, 'Idukki');
  assert.equal(idukki.list.length, 5);
  assert.equal(vendorsShown('Kasaragod', 'Kerala')!.district, undefined);
  // The model is told a state's list is not a list of who is near, in words that cannot be turned round.
  const told = vendorsForModel(idukki, 'Idukki', false) as { where_from: string; vendors: string[]; note: string };
  assert.match(told.where_from, /Kerala as a whole/);
  assert.match(told.where_from, /NOT picked for being near Idukki/);
  assert.match(told.vendors[0], /across the state/);
  assert.match((vendorsForModel(vendorsShown('Kasaragod', 'Kerala'), 'Kasaragod', true) as { where_from: string }).where_from, /for Kasaragod district/);
  assert.ok('not_known_where' in vendorsForModel(undefined, 'somewhere', false));

  // Asked for the details before any place is found, the tool says what to do first.
  const none = (await findTool('siteDetails')!.run('details-before-site', { about: 'all' })) as Record<string, unknown>;
  assert.equal(none.ok, false);
  assert.match(String(none.next), /findSolarSite/);
});

test('twenty-five years: the saving fades with the panels, the cost is earned back once, and a price rise is the person\'s own figure', async () => {
  // A 3 kW system: 1,02,000 rupees after the subsidy, saving 2,720 a month.
  const flat = longRun(102_000, 2_720, 0);
  assert.equal(flat.position.length, 26);
  assert.equal(flat.position[0], -102_000);
  assert.equal(flat.savedInYear[0], 32_640, 'the first year saves the full amount');
  assert.equal(flat.savedInYear[24], Math.round(32_640 * (1 - 0.008 * 24)), 'the last year saves 19.2% less: the panels have faded');
  assert.equal(flat.paysBackIn, 3.2, 'a little later than 1,02,000 / 32,640, because of the fade');
  assert.equal(flat.freeYears, 21.8);
  assert.ok(Math.abs(flat.aheadAtEnd - (flat.savedInAll - 102_000)) <= 1);
  for (let year = 1; year <= 25; year++) assert.ok(flat.position[year] > flat.position[year - 1], 'it only ever gains');
  assert.ok(flat.position[3] < 0 && flat.position[4] > 0, 'it crosses nought in the fourth year, where paysBackIn says');
  // "What if electricity gets 5% dearer every year": more saved, and earned back no later.
  const dearer = longRun(102_000, 2_720, 5);
  assert.ok(dearer.savedInAll > flat.savedInAll * 1.6);
  assert.ok(dearer.paysBackIn! <= flat.paysBackIn!);
  assert.equal(longRun(102_000, 2_720, 40).priceRisePercent, 10, 'a wild rise is held to ten percent');
  assert.equal(longRun(102_000, 2_720, -3).priceRisePercent, 0, 'and a fall is not taken at all');
  assert.equal(longRun(102_000, 0, 0).paysBackIn, null, 'a system that saves nothing never pays for itself');
  assert.equal(longRun(0, 2_000, 0).paysBackIn, 0);
  assert.equal(inLakh(740_000), '7.4 lakh');
  assert.equal(inLakh(12_800_000), '1.3 crore');
  assert.equal(inLakh(16_400), '16,000');

  // The tool wants a system first, then answers in words and leaves the chart's setting in the session.
  const sid = 'long-run';
  const early = (await findTool('longRunSavings')!.run(sid, { price_rise_percent: 0 })) as Record<string, unknown>;
  assert.equal(early.ok, false);
  await findTool('saveBill')!.run(sid, { monthly_units: 310, bill_amount: 3200 });
  await findTool('designSolar')!.run(sid, { target_kw: 0 });
  const told = (await findTool('longRunSavings')!.run(sid, { price_rise_percent: '5' })) as Record<string, unknown>;
  assert.equal(told.ok, true);
  assert.match(String(told.saved_over_25_years_in_words), /lakh/);
  assert.match(String(told.price_of_electricity), /5% dearer each year.*NOT a forecast/);
  assert.equal(getSession(sid)!.longRun!.priceRisePercent, 5);
  assert.equal(told.worked_out_just_now, undefined, 'a system already designed is used as it is');

  // Asked with the bill known and no system yet, it works the system out itself and says so.
  // In a real call "design it first" made the model read the design out and drop the question.
  const fresh = 'long-run-bill-only';
  await findTool('saveBill')!.run(fresh, { monthly_units: 310, bill_amount: 3200 });
  assert.equal(getSession(fresh)!.design, undefined);
  const atOnce = (await findTool('longRunSavings')!.run(fresh, { price_rise_percent: 0 })) as Record<string, unknown>;
  assert.equal(atOnce.ok, true);
  assert.match(String(atOnce.worked_out_just_now), /kW one was worked out from the bill/);
  assert.equal(getSession(fresh)!.design!.kw, atOnce.system_kw);
});

test('this week on the roof: the forecast becomes units by the design\'s own sum, the best day is one still to come, and a language is asked for by name', async () => {
  assert.equal(sunHoursFromMj(21.6), 6, '3.6 megajoules a square metre is one sun hour');
  assert.equal(unitsOn(3, 6), 13.5, 'three kilowatts, six sun hours, three quarters of it reaching the meter');
  assert.equal(skyWord(6, 5), 'bright');
  assert.equal(skyWord(5, 5), 'fair');
  assert.equal(skyWord(4, 5), 'cloudy');
  assert.equal(skyWord(3, 5), 'dull');
  assert.equal(skyWord(6, 5, 80), 'rain likely', 'rain is said even on a day with sun in it');
  const days = weekOutlook(
    [
      { date: '2026-11-20', mj: 22.29, rainChance: 0 },
      { date: '2026-11-21', mj: 21.73 },
      { date: 'not a date', mj: 3 },
      { date: '2026-11-22', mj: Number.NaN },
      { date: '2026-11-24', mj: 14.64, rainChance: 89 },
    ],
    4.66,
  );
  assert.equal(days.length, 3, 'a day the forecast left empty is dropped, not drawn as nought');
  assert.equal(days[0].sunHours, 6.19);
  assert.equal(days[0].sky, 'bright');
  assert.equal(days[2].sky, 'rain likely');
  // With no long-term figure for the month, the days are set against the best of the week.
  assert.deepEqual(weekOutlook([{ date: '2026-11-20', mj: 18 }, { date: '2026-11-21', mj: 9 }]).map((d) => d.sky), ['fair', 'dull']);
  assert.equal(bestAhead([13.9, 11.3, 12.1, 7.6]), 2, 'today is not the best day to plan for');
  assert.equal(bestAhead([5]), 0);
  assert.equal(dayName('2026-11-21'), 'Saturday 21 November');

  // A forecast is for one place: it stays when the roof is redrawn and goes when the home moves.
  const sid = 'week-place';
  updateSession(sid, (s) => {
    s.location = { label: 'Bengaluru', lat: 12.97, lon: 77.59, sunHours: 5.5, monthly: [], source: 'default' };
    s.week = { key: 'k', place: 'Bengaluru', days, fetchedAt: 1 };
  });
  updateSession(sid, (s) => {
    s.roof = { areaM2: 80, shadeFraction: 0.1, panelsFit: 12, source: 'spoken' } as never;
  });
  assert.ok(getSession(sid)!.week, 'a roof redrawn at the same place keeps the forecast');
  updateSession(sid, (s) => {
    s.location = { ...s.location!, label: 'Jaipur', lat: 26.91, lon: 75.79 };
  });
  assert.equal(getSession(sid)!.week, undefined);

  // "Carry on in Kannada": the name in English, in its own letters, or as a code.
  assert.equal(languageSaid('Kannada'), 'kn');
  assert.equal(languageSaid('हिन्दी'), 'hi');
  assert.equal(languageSaid('in Tamil please'), 'ta');
  assert.equal(languageSaid('ml'), 'ml');
  assert.equal(languageSaid('French'), undefined);
  const lsid = 'lang-ask';
  const asked = (await findTool('changeLanguage')!.run(lsid, { language: 'Telugu' })) as Record<string, unknown>;
  assert.equal(asked.switching_to, 'Telugu');
  assert.match(String(asked.next), /One moment/);
  assert.equal(getSession(lsid)!.langAsk!.to, 'te');
  assert.equal(getSession(lsid)!.lang, 'en', 'the tool only leaves the note: the call screen makes the change');
  const same = (await findTool('changeLanguage')!.run(lsid, { language: 'english' })) as Record<string, unknown>;
  assert.equal(same.already_speaking, 'English');
  assert.equal(((await findTool('changeLanguage')!.run(lsid, { language: 'French' })) as Record<string, unknown>).ok, false);
});

test('right now on the roof: sunshine becomes kilowatts, the best hour is found, and the sun covers what it can of what is asked', async () => {
  assert.equal(powerFrom(3, 800), 1.8, 'three kilowatts under 800 watts a square metre, three quarters of it reaching the meter');
  assert.equal(powerFrom(3, -5), 0);
  // A clear November day in Bengaluru, hour by hour, as the weather service gave it.
  const hours = [0, 0, 0, 0, 0, 0, 0, 98, 323, 551, 735, 854, 899, 868, 762, 591, 371, 136, 4, 0, 0, 0, 0, 0];
  assert.deepEqual(bestHour(hours), { hour: 12, watts: 899 });
  assert.equal(unitsFromHours(2.5, hours), 11.6, "the hours add up to the day's figure in the week's forecast");
  assert.equal(clockSaid(12), '12 noon');
  assert.equal(clockSaid(14), '2 pm');
  assert.equal(clockSaid(11), '11 am');
  assert.equal(clockSaid(6, 20), '6:20 am');
  assert.equal(clockSaid(0), 'midnight');
  assert.deepEqual(appliancesSaid('AC, geyser'), ['ac', 'geyser']);
  assert.deepEqual(appliancesSaid('the air conditioner'), ['ac']);
  assert.deepEqual(appliancesSaid('the washing machine and a fan'), ['fan', 'washer']);
  assert.deepEqual(appliancesSaid('none'), []);
  assert.deepEqual(appliancesSaid('a machine'), [], '"ac" inside another word is not an AC');
  // 2.3 kilowatts carries the fridge, three fans, the TV, the washing machine and the pump together; the AC on top would not fit.
  const usual = usualCovered(2.3);
  assert.equal(usual.names.length, 5);
  assert.equal(usual.watts, 150 + 3 * 75 + 100 + 500 + 750);
  assert.equal(usual.names[1], 'three ceiling fans');
  assert.deepEqual(usualCovered(0.1).names, [], 'early or late, not even the fridge');
  const asked = askedCovered(2.3, ['ac', 'geyser']);
  assert.equal(asked.watts, 3500);
  assert.equal(shareSaid(asked.share), 'about two thirds of it');
  assert.equal(shareSaid(1), 'all of it');
  assert.equal(shareSaid(0.5), 'about half of it');
  assert.equal(shareSaid(0.05), 'only a little of it');
  assert.equal(shareSaid(0), 'none of it');
  // The tool wants a place before anything else.
  const none = (await findTool('powerNow')!.run('now-no-place', { appliances: 'AC' })) as Record<string, unknown>;
  assert.equal(none.ok, false);
  assert.match(String(none.next), /setLocation/);
});

test('a device that will not say where it is gets the reason and the way round it, for the device in the hand', () => {
  const chromeOnIphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1';
  const safariOnIphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
  const android = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
  const laptop = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  assert.equal(deviceKind(chromeOnIphone), 'iphone');
  assert.equal(deviceKind(android), 'android');
  assert.equal(deviceKind(laptop), 'computer');
  assert.equal(iphoneBrowser(chromeOnIphone), 'Chrome');
  assert.equal(iphoneBrowser(safariOnIphone), 'Safari Websites', 'the name the iPhone lists Safari under');
  assert.equal(faultOf(1), 'refused');
  assert.equal(faultOf(2), 'unavailable');
  assert.equal(faultOf(3), 'slow');
  assert.equal(faultOf(undefined), 'unavailable');
  // Refused on an iPhone: the switch is in Settings, under the browser's own name, and the page is never asked until it is on.
  const iphone = locationHelp('refused', chromeOnIphone);
  assert.match(iphone, /Settings app, then Privacy & Security, then Location Services, then Chrome/);
  assert.match(iphone, /While Using the App/);
  assert.match(locationHelp('refused', safariOnIphone), /Location Services, then Safari Websites/);
  assert.match(locationHelp('refused', android), /left of the address bar, then Permissions, then Location/);
  assert.match(locationHelp('refused', laptop), /Click the icon at the left of the address bar/);
  // Too slow or no fix is not a refusal, and is not answered with a trip to Settings.
  assert.doesNotMatch(locationHelp('slow', chromeOnIphone), /Settings/);
  assert.match(locationHelp('slow', chromeOnIphone), /near a window/);
  assert.match(locationHelp('unavailable', laptop), /Wi-Fi/);
  // Every answer leaves the person a way on that needs no location at all.
  for (const fault of ['refused', 'unavailable', 'slow', 'unsupported', 'insecure'] as const) for (const ua of [chromeOnIphone, android, laptop]) assert.match(locationHelp(fault, ua), /earch for your address above/);
});

test('a booked visit becomes a real calendar entry, and no reminder is promised without one', async () => {
  // Friday 20 November 2026, half past eight in the evening in India.
  const now = new Date('2026-11-20T15:00:00Z');
  assert.deepEqual(timeSaid('10 am'), { hour: 10, minute: 0 });
  assert.deepEqual(timeSaid('4'), { hour: 16, minute: 0 }, 'a bare four for a visit is the afternoon');
  assert.deepEqual(timeSaid('10:30'), { hour: 10, minute: 30 });
  assert.deepEqual(timeSaid('5.30 p.m.'), { hour: 17, minute: 30 });
  assert.deepEqual(timeSaid('evening'), { hour: 17, minute: 0 });
  assert.equal(timeSaid('sometime'), null);
  assert.equal(whenIs('Saturday', '10 am', now)?.toISOString(), '2026-11-21T04:30:00.000Z', 'ten in the morning in India is half past four by the world clock');
  assert.equal(whenIs('tomorrow', '4 pm', now)?.toISOString(), '2026-11-21T10:30:00.000Z');
  assert.equal(whenIs('22 November', '11 am', now)?.toISOString(), '2026-11-22T05:30:00.000Z');
  assert.equal(whenIs('Friday', '10 am', now)?.toISOString(), '2026-11-27T04:30:00.000Z', 'said on a Friday, "Friday" is next week');
  assert.equal(whenIs('5 January', '10 am', now)?.toISOString(), '2027-01-05T04:30:00.000Z', 'a date already gone this year is next year');
  assert.equal(whenIs('soon', '10 am', now), null, 'a day that cannot be read gives no moment, not a guess');
  assert.equal(whenIs('today', '9 am', now), null, 'nor does a time already gone');
  const start = whenIs('Saturday', '10 am', now)!;
  assert.equal(visitSaid(start), 'Saturday 21 November, 10 am');
  const file = visitCalendar({ id: 'visit-1', installer: 'Sunrise Solar, Jaipur', start, passbookUrl: 'https://example.org/plan/x', made: now });
  assert.match(file, /DTSTART:20261121T043000Z\r\nDTEND:20261121T053000Z/);
  assert.match(file, /TRIGGER:-P1D/, 'the reminder the day before is the calendar\'s own');
  assert.match(file, /SUMMARY:Solar site visit: Sunrise Solar\\, Jaipur/);
  assert.ok(file.startsWith('BEGIN:VCALENDAR\r\n') && file.endsWith('END:VCALENDAR\r\n'));

  // The tool: a day it can read is booked for a moment; one it cannot is noted, with no reminder promised.
  const sid = 'visit-booking';
  const clear = (await findTool('bookVisit')!.run(sid, { installer: 'Sunrise Solar', day: 'tomorrow', time: '10 am' })) as Record<string, unknown>;
  assert.equal(clear.ok, true);
  assert.ok(clear.booked_for && getSession(sid)!.booking!.at);
  assert.match(String(clear.next), /never say it will/);
  const vague = (await findTool('bookVisit')!.run(sid, { installer: 'Sunrise Solar', day: 'sometime next month', time: 'whenever' })) as Record<string, unknown>;
  assert.equal(getSession(sid)!.booking!.at, undefined);
  assert.match(String(vague.no_calendar_entry), /Do NOT promise a reminder/);
});

test('the tour and the venue: fixed steps of real tools, and the hall found by the name people say', () => {
  // The map knows the hackathon's building by its estate's name, not by the school's.
  assert.equal(mapNameFor('Polaris School of Technology'), 'Divyashree Technopark, Bengaluru');
  assert.equal(mapNameFor('the divyasree techno park'), 'Divyashree Technopark, Bengaluru');
  assert.equal(mapNameFor('Vidhana Soudha'), 'Vidhana Soudha');
  // Only a session the tour page made can be driven without a call, and only through its own steps.
  assert.ok(isTourSession('tour-abc123'));
  for (const not of ['abc123', 'tour-', 'tour-abc', 'tour-ABC123', 'tour-abc123!', 'e2e-tour-abc123']) assert.equal(isTourSession(not), false, not);
  assert.equal(TOUR.length, 10);
  for (const step of TOUR) {
    assert.ok(findTool(step.tool), `the tour names a tool that does not exist: ${step.tool}`);
    assert.ok(step.says.length > 10 && step.hold >= 0 && step.hold <= 20);
  }
});

test('the second weather source: the sun by arithmetic, and cloud taking its share', () => {
  const [lat, lon] = [12.97, 77.59]; // Bengaluru
  const noon = Date.UTC(2026, 10, 21, 6, 36); // 12:06 pm in India, when the sun is highest there in late November
  // Late November: the sun stands about 33 degrees south of overhead at noon, and is down at midnight.
  assert.ok(Math.abs(sunHeight(noon, lat, lon) - Math.cos((33 * Math.PI) / 180)) < 0.02, String(sunHeight(noon, lat, lon)));
  assert.ok(sunHeight(noon + 12 * 3_600_000, lat, lon) < 0);
  // Overhead at the equator at an equinox noon.
  assert.ok(sunHeight(Date.UTC(2026, 2, 20, 12, 7), 0, 0) > 0.995);
  assert.equal(clearSkyWatts(-0.2), 0);
  assert.ok(clearSkyWatts(1) > 1000 && clearSkyWatts(1) < 1100);
  assert.equal(underCloud(800, 0), 800);
  assert.equal(underCloud(800, 100), 200);
  assert.equal(underCloud(800, 250), 200);

  // Cloud between two forecast points is a straight line, and holds at the ends.
  const points: SkyPoint[] = [{ at: noon, cloud: 0 }, { at: noon + 2 * 3_600_000, cloud: 100 }];
  assert.equal(cloudAt(points, noon + 3_600_000), 50);
  assert.equal(cloudAt(points, noon - 5 * 3_600_000), 0);
  assert.equal(cloudAt(points, noon + 9 * 3_600_000), 100);
  assert.equal(cloudAt([], noon), 0);

  // A clear week in Bengaluru in November: between five and seven sun hours a day, dated in Indian time.
  const justAfterMidnight = Date.UTC(2026, 10, 20, 19, 0); // 00:30 on the 21st in India
  const clear = weekOf([], lat, lon, justAfterMidnight);
  assert.equal(clear.length, 7);
  assert.equal(clear[0].date, '2026-11-21');
  assert.equal(clear[6].date, '2026-11-27');
  for (const day of clear) assert.ok(day.mj / 3.6 > 5 && day.mj / 3.6 < 7, `${day.date} ${day.mj}`);
  // The same week under a sky wholly covered keeps a quarter.
  const grey = weekOf([{ at: 0, cloud: 100 }], lat, lon, justAfterMidnight);
  assert.ok(Math.abs(grey[0].mj / clear[0].mj - 0.25) < 0.01);

  // Today: 24 hours, dark at night, most around noon, the sun up from about twenty past six to ten to six.
  const today = todayOf([], lat, lon, noon);
  assert.equal(today.hours.length, 24);
  assert.equal(today.at, '2026-11-21T12:06');
  assert.equal(today.isDay, true);
  assert.ok(today.hours[3] === 0 && today.hours[22] === 0);
  assert.ok([12, 13].includes(today.hours.indexOf(Math.max(...today.hours))));
  assert.ok(today.sunNow > 750 && today.sunNow < 950, String(today.sunNow));
  assert.match(today.sunrise!, /^06:(1[5-9]|2[0-9])$/);
  assert.match(today.sunset!, /^17:(4[5-9]|5[0-9])$/);
  // The day's hours add up to the day's total, to within a twentieth.
  const fromHours = today.hours.reduce((a, b) => a + b, 0) * 3600;
  assert.ok(Math.abs(fromHours / 1e6 / weekOf([], lat, lon, noon)[0].mj - 1) < 0.05);
});
