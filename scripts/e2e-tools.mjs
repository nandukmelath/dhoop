/**
 * End to end, without a call: every tool run the way the agent runs it, the session, the
 * passbook and its voice note in all six languages, every page, and the doors that must stay
 * shut. About seventy checks in under a minute. It starts no agent, so it uses no call minutes.
 *
 * Needs the app running in development (npm run dev): it calls the tools through the /dev
 * shortcut, which a production build closes. The voice notes ask Murf for a few hundred
 * characters each the first time.
 *   npm run e2e
 *   npm run e2e -- http://localhost:3001
 */
const BASE = process.argv[2] ?? 'http://localhost:3000';
const sid = `e2e-${Date.now().toString(36)}`;
let pass = 0;
const fails = [];
const post = async (path, body) => {
  const began = Date.now();
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
  return { status: res.status, json: await res.json().catch(() => null), ms: Date.now() - began };
};
const tool = (name, args) => post(`/api/tools/${name}?sid=${sid}&dev=1`, args);
const session = async () => { const j = await (await fetch(`${BASE}/api/session/${sid}`)).json(); return j.session ?? j; };
const check = (label, ok, detail = '') => {
  if (ok) pass += 1; else fails.push(label);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  ·  ${detail}` : ''}`);
};
const step = async (label, name, args, test, show) => {
  const r = await tool(name, args);
  const j = r.json ?? {};
  let good = false;
  try { good = !!test(j); } catch { good = false; }
  check(`${label} (${name}, ${(r.ms / 1000).toFixed(1)} s)`, good, good ? (show ? show(j) : '') : JSON.stringify(j).slice(0, 220));
  return j;
};

await post(`/api/session/${sid}`, { type: 'reset' });
const loc = await post(`/api/session/${sid}`, { type: 'device_location', lat: 12.9719, lon: 77.6412, accuracy: 20, first: true });
check('the device\'s location places the home and finds a building', loc.json?.used === true && loc.json?.found === true, loc.json?.place ?? JSON.stringify(loc.json));
await step('the bill is saved', 'saveBill', { monthly_units: 310, bill_amount: 3200, source: 'spoken' }, (j) => j.ok && j.monthly_units === 310);
const roof = await step('the roof is found from the location', 'findMyRoof', { reason: 'e2e' }, (j) => j.ok && j.found && j.roof_area_sqft > 100, (j) => `${j.place}, ${j.roof_area_sqft} sq ft, ${j.panels_that_fit} panels`);
await step('a system is designed, with the year month by month', 'designSolar', { target_kw: 0 }, (j) => j.ok && j.system_kw > 0 && j.through_the_year?.poorest_month, (j) => `${j.system_kw} kW, saves ₹${j.saving_per_month_rupees} a month, poorest ${j.through_the_year.poorest_month}`);
await step('the roof grows on one side', 'changeRoof', { change: 'add', side: 'right', amount: 300, unit: 'square_metres' }, (j) => j.ok && j.panels_that_fit > j.panels_before && j.system_worked_out_again, (j) => `${j.panels_before} → ${j.panels_that_fit} panels, ${j.side_that_moved}`);
await step('a part is left out', 'changeRoof', { change: 'remove', side: 'top', amount: 25, unit: 'percent' }, (j) => j.ok && j.panels_that_fit < j.panels_before, (j) => `${j.panels_before} → ${j.panels_that_fit} panels`);
await step('the outline is moved', 'moveRoof', { direction: 'top', distance: 10, unit: 'feet' }, (j) => j.ok && j.moved_metres === 3 && j.the_roof_is_the_same_size);
for (const n of [1, 2, 3]) await step(`undo ${n} of 3`, 'undoRoofChange', { reason: 'e2e' }, (j) => j.ok, (j) => `${j.undone}; ${j.panels_that_fit} panels`);
await step('nothing more to undo is said plainly', 'undoRoofChange', { reason: 'e2e' }, (j) => j.ok === false);
const back = await session();
check('after the undos the roof is the one first found', Math.round(back.roof.areaM2 * 10.7639) === roof.roof_area_sqft, `${Math.round(back.roof.areaM2 * 10.7639)} sq ft`);
await step('the next building over is picked', 'nextBuilding', { direction: 'right' }, (j) => j.ok && j.found, (j) => `${j.metres_from_the_last_building} m away, ${j.roof_area_sqft} sq ft`);
await step('and undone', 'undoRoofChange', { reason: 'e2e' }, (j) => j.ok);
const street = await step('the whole neighbourhood is added up', 'showNeighbourhood', { radius_metres: 200 }, (j) => j.ok && j.roofs > 20 && j.power_in_words, (j) => `${j.roofs} roofs, ${j.power_in_words}, ${j.worth_a_year_in_words}`);
const rings = await (await fetch(`${BASE}/api/street/${sid}`)).json().catch(() => null);
check('its roof outlines are served to the map', Array.isArray(rings?.rings) && rings.rings.length >= street.roofs - 2, `${rings?.rings?.length} outlines`);
await step('the best place for a solar farm is found, with reasons', 'findSolarSite', { capacity_mw: 1, search_in: 'Tumakuru district' }, (j) => j.ok && j.land_needed_acres === 4.5 && j.why_it_is_best?.length >= 3 && j.what_was_not_checked, (j) => `${j.best_place}; ${j.places_compared} compared; ${j.energy_a_year_in_words}`);
check('the screen is on the farm site', !!(await session()).site);
await step('the grid, the vendors and the money for it are fetched', 'siteDetails', { about: 'all' }, (j) => j.ok && j.money?.earns_a_year_in_words && j.grid && j.vendors, (j) => `${Array.isArray(j.grid?.nearest_substations) ? j.grid.nearest_substations[0] : 'no substation read'}; earns ${j.money.earns_a_year_in_words}`);
check('a district whose own vendor list was not read gets its state list', (await session()).site?.details?.vendors?.scope === 'state' && (await session()).site.details.vendors.place === 'Karnataka', `${(await session()).site?.details?.vendors?.place}, ${(await session()).site?.details?.vendors?.list?.length} vendors`);
await step('registered vendors are found for a town far away', 'findVendors', { place: 'Jaipur' }, (j) => j.ok && j.vendors?.length === 5 && /Rajasthan as a whole/.test(j.where_from), (j) => `${j.asked_for}: ${j.vendors[0].split(':')[0]}`);
await step('and for a district whose own list was read', 'findVendors', { place: 'Kasaragod' }, (j) => j.ok && /for Kasaragod district/.test(j.where_from), (j) => j.vendors[0].split(';')[0]);
await step('and for where the person is', 'findVendors', { place: 'here' }, (j) => j.ok && j.vendors?.length >= 1, (j) => j.where_from.slice(0, 90));
check('the vendors are on the screen', (await session()).vendors?.list?.length >= 1, `${(await session()).vendors?.askedFor}`);
await step('named places are compared', 'comparePlaces', { places: 'Kochi; Jaipur' }, (j) => j.ok && j.best_place === 'Jaipur' && j.places?.length === 2, (j) => j.the_reason.slice(0, 110));
await step('two sizes are compared', 'compareSizes', { kw_a: 2, kw_b: 3 }, (j) => j.ok && j.first?.system_kw === 2 && j.second?.system_kw === 3);
check('talk of the system takes the screen back from the farm site', !(await session()).site);
await step('twenty-five years are worked out', 'longRunSavings', { price_rise_percent: 0 }, (j) => j.ok && j.pays_for_itself_in_years > 0 && /lakh/.test(j.saved_over_25_years_in_words), (j) => `pays for itself in ${j.pays_for_itself_in_years} years; saves ${j.saved_over_25_years_in_words}`);
await step('and again with electricity dearer each year', 'longRunSavings', { price_rise_percent: 5 }, (j) => j.ok && /5% dearer/.test(j.price_of_electricity), (j) => `saves ${j.saved_over_25_years_in_words}`);
await step("this week's forecast becomes units", 'sunForecast', { about: 'tomorrow' }, (j) => j.ok && j.the_week?.length >= 5 && /units/.test(j.tomorrow), (j) => `${j.tomorrow}; best ahead: ${j.best_day_ahead}`);
await step('what the roof makes right now is looked up', 'powerNow', { appliances: 'AC, geyser' }, (j) => j.ok && j.today && /YES/.test(j.they_asked_about?.it_runs ?? ''), (j) => `${j.as_of}: ${j.making_right_now}; today ${j.today.slice(0, 50)}`);
check("today's hours are on the screen", (await session()).now?.hours?.length === 24 && (await session()).now.asked?.join() === 'ac,geyser');
check('the week and the long run are on the screen', !!(await session()).week?.days?.length && (await session()).longRun?.priceRisePercent === 5);
await step('another language is asked for by voice', 'changeLanguage', { language: 'Kannada' }, (j) => j.ok && j.switching_to === 'Kannada');
check('a note to switch is left for the call screen', (await session()).langAsk?.to === 'kn');
await step('eligibility is checked and a mismatch is flagged', 'checkEligibility', { is_a_home: 'yes', connection_in_own_name: 'yes', bank_account_same_name: 'no', roof_is_theirs_to_use: 'yes' }, (j) => j.ok && j.put_right_first?.length === 1, (j) => j.verdict);
await step('the application stage is recorded', 'subsidySteps', { last_stage_done: 3 }, (j) => j.ok && j.stages_done === 3 && j.next_stage?.number === 4, (j) => `next: ${j.next_stage.name}`);
await step('the stage is remembered when not said', 'subsidySteps', { last_stage_done: -1 }, (j) => j.ok && j.stages_done === 3);
await step('the loan is worked out', 'loanPlan', { years: 0 }, (j) => j.ok && j.instalment_per_month_rupees > 0, (j) => `₹${j.instalment_per_month_rupees} a month over ${j.years} years against ₹${j.saving_per_month_rupees} saved`);
await step('the survey goes to installers', 'requestQuotes', { homeowner_name: 'Asha' }, (j) => j.ok && j.survey_id);
const q = await post('/api/installer', { sid, installer: 'Sunrise Solar', price: 152000, days: 9, note: 'End-to-end test quote' });
check('an installer\'s quote is accepted', q.status === 200 && (q.json?.ok ?? !!q.json?.quote ?? true), JSON.stringify(q.json).slice(0, 120));
await step('the quote is read back', 'getQuotes', { reason: 'e2e' }, (j) => j.ok && j.quotes?.length === 1 && j.quotes[0].installer === 'Sunrise Solar', (j) => `₹${j.quotes[0].price_before_subsidy_rupees}, ${j.quotes[0].install_days} days`);
await step('the visit is booked', 'bookVisit', { installer: 'Sunrise Solar', day: 'Saturday', time: '10 am' }, (j) => j.ok && j.booking_id);
await step('the solar story is started', 'playSolarStory', { reason: 'e2e' }, (j) => j.ok && j.playing);
const script = await (await fetch(`${BASE}/api/plan/${sid}/voice?lang=ta&script=1`)).json().catch(() => null);
check('its script comes a sentence to a scene', Array.isArray(script?.parts) && script.parts.length >= 5 && script.parts[0].kind === 'hello', (script?.parts ?? []).map((p) => p.kind).join(', '));
await step('the roof survey is read', 'getRoofSurvey', { reason: 'e2e' }, (j) => j.ok && j.measured);
const s1 = await session();
check('the session holds the whole story', !!(s1.bill && s1.roof && s1.design && s1.application && s1.loan && s1.survey && s1.booking && s1.street && s1.places), ['bill', 'roof', 'design', 'application', 'loan', 'survey', 'booking', 'street', 'places'].filter((k) => !s1[k]).join(', ') || 'bill, roof, design, application, loan, survey, booking, neighbourhood, places');
// The passbook for this session, in each language, and its voice note.
for (const lang of ['en', 'hi', 'kn', 'ta', 'te', 'ml']) {
  const page = await fetch(`${BASE}/plan/${sid}?lang=${lang}`);
  const html = await page.text();
  const title = (html.match(/<h1[^>]*>(.*?)<\/h1>/s)?.[1] ?? '').replace(/<[^>]+>/g, '');
  const note = await fetch(`${BASE}/api/plan/${sid}/voice?lang=${lang}`);
  const bytes = (await note.arrayBuffer()).byteLength;
  check(`the passbook and its voice note in ${lang}`, page.status === 200 && title.length > 3 && note.status === 200 && (note.headers.get('content-type') ?? '').includes('audio') && bytes > 50_000, `"${title}", note ${Math.round(bytes / 1024)} KB`);
}
// A named building, a town, a roof told as a size: each replaces the home, so they come last.
await step('a building is found by name', 'findBuilding', { place: 'Vidhana Soudha, Bengaluru' }, (j) => j.ok && j.found && j.panels_that_fit > 1000, (j) => `${j.place}, ${j.panels_that_fit} panels`);
await step('a town is set by name', 'setLocation', { place: 'Tumakuru' }, (j) => j.ok && j.peak_sun_hours_per_day > 3, (j) => `${j.place}, ${j.peak_sun_hours_per_day} sun hours`);
await step('a roof is taken as a size', 'setRoofManual', { area_sqft: 650, shade_percent: 20 }, (j) => j.ok && j.panels_that_fit > 0);
// The doors that must stay shut.
const noKey = await post(`/api/tools/saveBill?sid=${sid}`, { monthly_units: 1, bill_amount: 1, source: 'spoken' });
check('a tool call without the secret is refused', noKey.status === 401);
const unknown = await post(`/api/tools/notATool?sid=${sid}&dev=1`, {});
check('an unknown tool is refused', unknown.status === 404);
// The tour: a visitor with no microphone watches fixed steps run. It may run its own steps and nothing else.
const tourSid = `tour-${Date.now().toString(36).slice(-8)}`;
const tourStep = await post(`/api/tour/${tourSid}`, { step: 2 });
check('a tour step runs a real tool with no call', tourStep.status === 200 && tourStep.json?.ok === true && typeof tourStep.json?.did === 'string', String(tourStep.json?.did ?? '').slice(0, 90));
check('the tour refuses a session that is not its own', (await post(`/api/tour/${sid}`, { step: 2 })).status === 400);
check('the tour refuses a step it does not have', (await post(`/api/tour/${tourSid}`, { step: 99 })).status === 400);
// The other pages.
for (const path of ['/', '/dev', '/installer', '/wall', '/join', '/tour', '/brand', '/brand/dhoop-social-1200x630.png', '/api/status', `/api/session/${sid}`]) {
  const res = await fetch(`${BASE}${path}`);
  check(`page ${path.replace(sid, '<session>')}`, res.status === 200, String(res.status));
}
await post(`/api/session/${sid}`, { type: 'reset' });
const cleared = await session();
check('a reset clears the session', !cleared.bill && !cleared.roof && !cleared.street && !cleared.places && !cleared.site);
console.log(`\n${pass} passed, ${fails.length} failed${fails.length ? ':\n  ' + fails.join('\n  ') : ''}`);
process.exit(fails.length ? 1 : 0);
