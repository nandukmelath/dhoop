/**
 * Films the roof reveal on the test page, checks it, and saves contact sheets of it.
 *
 * Why this exists: the reveal is animation. A browser that is not on screen (an editor's preview
 * pane, a covered window) hardly draws frames, so what it shows of an animation is misleading.
 * This drives a headless copy of Chrome with a throwaway profile, where frames are drawn at
 * full rate, and notes with every frame what is on the map.
 *
 * It plays five things: the first roof of a conversation (the dive from above the country),
 * Dhoop recommending a system, a roof in another town (it should dive again), a building a
 * few doors away (it should draw in place) and a landmark asked for by name.
 *
 * Needs the app running (npm run dev) and Google Chrome installed. Uses no agent time.
 *   npm run film:reveal             sheets go to a new folder in the system's temp directory
 *   npm run film:reveal -- <dir>    or to a folder you name
 * CHROME_PATH and DHOOP_URL say where Chrome and the app are, when not in the usual places.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const APP = `${process.env.DHOOP_URL ?? 'http://localhost:3000'}/dev`;
const PORT = 9333;
const out = process.argv[2] ? resolve(process.argv[2]) : mkdtempSync(join(tmpdir(), 'dhoop-reveal-'));
mkdirSync(out, { recursive: true });
const profile = join(out, 'chrome-profile');

/** Two spots with mapped buildings: one in Bengaluru, one in Udupi, 300 km away. */
const FIRST = { lat: 12.9719, lon: 77.6412 };
const FAR = { lat: 13.3352, lon: 74.7521 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn(
  CHROME,
  ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--window-size=1280,800', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--hide-scrollbars', 'about:blank'],
  { stdio: 'ignore' },
);

let socket;
let lastId = 0;
const waiting = new Map();
const pageEvents = [];

/** One command to Chrome. Gives up after `limit` ms, so a stuck page cannot hang the run. */
const send = (method, params = {}, limit = 15000) =>
  Promise.race([
    new Promise((done, fail) => {
      const id = ++lastId;
      waiting.set(id, { done, fail });
      socket.send(JSON.stringify({ id, method, params }));
    }),
    sleep(limit).then(() => {
      throw new Error(`${method} gave no answer in ${limit} ms`);
    }),
  ]);

/** Run an expression in the page and return its value. */
const inPage = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
};

/** What is on the map right now, and where the map is on the page. */
const LOOK = `(() => {
  const paths = [...document.querySelectorAll('.leaflet-overlay-pane path')];
  const outline = paths.find((p) => p.getAttribute('stroke') === '#fbbf24');
  const panels = paths.filter((p) => p.classList.contains('dhoop-panel'));
  const card = document.querySelector('[class*="bg-black/70"]');
  const map = document.querySelector('.leaflet-container');
  const r = map?.getBoundingClientRect();
  const top = r ? Math.max(0, Math.floor(r.y)) : 0;
  return {
    panels: panels.length,
    lit: panels.filter((p) => Number(p.getAttribute('fill-opacity')) > 0.5).length,
    outline: !!outline,
    tracing: !!outline && (outline.getAttribute('style') || '').includes('dasharray'),
    text: card ? card.innerText.replace(/\\s+/g, ' ').trim() : '',
    box: r ? { x: Math.max(0, Math.floor(r.x)) + Math.round(scrollX), y: top + Math.round(scrollY), width: Math.floor(r.width), height: Math.max(1, Math.floor(Math.min(r.bottom, innerHeight) - top)) } : null,
  };
})()`;

/** Take a frame of the map about every `every` ms for `ms`, with what was on it. */
async function film(label, ms, every = 170) {
  await inPage(`document.querySelector('.leaflet-container')?.scrollIntoView({ block: 'center' })`);
  const frames = [];
  const began = Date.now();
  while (Date.now() - began < ms) {
    const at = Date.now() - began;
    const { box, ...seen } = await inPage(LOOK);
    if (box) {
      const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 72, clip: { ...box, scale: 1 } }, 4000);
      frames.push({ label, at, ...seen, data: shot.data });
    }
    const left = every - (Date.now() - began - at);
    if (left > 0) await sleep(left);
  }
  return frames;
}

const nearest = (frames, t) => frames.reduce((best, f) => (Math.abs(f.at - t) < Math.abs(best.at - t) ? f : best), frames[0]);
const firstAt = (frames, test) => frames.find(test)?.at ?? -1;

/** Lay frames out four to a row on one page and save a picture of that page. */
async function sheet(name, frames) {
  const cells = frames
    .map((f) => `<figure><img src="data:image/jpeg;base64,${f.data}"><figcaption>${f.label} +${(f.at / 1000).toFixed(1)} s · ${f.panels} panels (${f.lit} lit)${f.tracing ? ' · tracing' : ''}</figcaption></figure>`)
    .join('');
  const page = join(out, `${name}.html`);
  writeFileSync(page, `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#111;color:#eee;font:13px system-ui}main{display:grid;grid-template-columns:repeat(4,470px);gap:6px;padding:6px}figure{margin:0}img{display:block;width:470px}figcaption{padding:2px 4px}</style><main>${cells}</main>`);
  await send('Page.navigate', { url: `file://${page}` });
  await sleep(900);
  const size = await inPage(`(() => { const m = document.querySelector('main'); return { width: Math.ceil(m.scrollWidth), height: Math.ceil(m.scrollHeight) }; })()`);
  await send('Emulation.setDeviceMetricsOverride', { ...size, deviceScaleFactor: 1, mobile: false });
  await sleep(300);
  const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
  writeFileSync(join(out, `${name}.jpg`), Buffer.from(shot.data, 'base64'));
  rmSync(page);
}

const results = [];
const check = (name, ok, detail) => {
  results.push(ok);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`);
};

try {
  // Wait for Chrome, then talk to its one page.
  let address;
  for (let i = 0; i < 60 && !address; i++) {
    try {
      address = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page')?.webSocketDebuggerUrl;
    } catch {
      // Chrome is still starting.
    }
    if (!address) await sleep(200);
  }
  if (!address) throw new Error(`Chrome did not start. Is it at ${CHROME}?`);
  socket = new WebSocket(address);
  await new Promise((opened, failed) => {
    socket.onopen = opened;
    socket.onerror = () => failed(new Error('could not connect to Chrome'));
  });
  socket.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.method === 'Runtime.exceptionThrown') pageEvents.push(`error in the page: ${msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text}`);
    if (msg.method === 'Inspector.targetCrashed') pageEvents.push('the page crashed');
    const wait = msg.id && waiting.get(msg.id);
    if (!wait) return;
    waiting.delete(msg.id);
    if (msg.error) wait.fail(new Error(msg.error.message));
    else wait.done(msg.result);
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Inspector.enable').catch(() => {});
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: APP });
  let ready = false;
  for (let i = 0; i < 80 && !ready; i++) {
    ready = await inPage(`!!document.querySelector('.leaflet-container')`).catch(() => false);
    if (!ready) await sleep(250);
  }
  if (!ready) throw new Error(`the test page did not open at ${APP}. Is the app running?`);
  await sleep(1500);

  const sid = await inPage(`window.localStorage.getItem('dhoop-dev-sid')`);
  const post = (body) => inPage(`fetch('/api/session/${sid}', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: ${JSON.stringify(JSON.stringify(body))} }).then((r) => r.json())`);
  const roofNow = () => inPage(`fetch('/api/session/${sid}').then((r) => r.json()).then((j) => JSON.stringify(j.roof?.polygon ?? null))`);
  const press = (starts) => inPage(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim().startsWith(${JSON.stringify(starts)})); if (b) b.click(); return !!b; })()`);

  // 1. The first roof of a conversation: the dive from high above the country.
  const found = await post({ type: 'device_location', ...FIRST, accuracy: 30, first: true });
  check('a building is found at the first spot', !!found?.found, found?.place);
  const first = await film('first', 15500);
  const traced = firstAt(first, (f) => f.tracing);
  const landing = firstAt(first, (f) => f.panels > 0);
  const last = first.at(-1);
  check('the dive ends and the outline traces itself', traced > 3000, `${traced} ms after the building was found`);
  check('panels land after the outline', landing > traced, `${landing} ms`);
  check('the outline is there whenever panels are', first.every((f) => f.panels === 0 || f.outline));
  check('the numbers count up to the roof', /panels fit/.test(last.text) && new Set(first.map((f) => f.text).filter(Boolean)).size > 2, last.text);
  check('as many panels are drawn as the numbers say', Number(last.text.match(/(\d+) panels fit/)?.[1]) === last.panels, `${last.panels} drawn`);

  // 2. Dhoop recommends a system: its panels stay lit, the rest of the room dims.
  await press('1. Save bill');
  await sleep(1500);
  await press('4. Design the system');
  const system = await film('system', 4500);
  const lit = Number(system.at(-1).text.match(/(\d+) panels lit/)?.[1]);
  check('the recommended panels stay lit', lit > 0 && system.at(-1).lit === lit, system.at(-1).text);
  const kw = (text) => Number(text?.match(/([\d.]+) kW/)?.[1] ?? NaN);
  const firstShown = system.find((f) => /panels lit/.test(f.text))?.text;
  check('the new numbers count up from nothing', kw(firstShown) < kw(system.at(-1).text), firstShown);

  // 3. A roof in another town: it dives again.
  const farFound = await post({ type: 'device_location', ...FAR, accuracy: 30, first: true });
  check('a building is found at the far spot', !!farFound?.found, farFound?.place);
  const far = await film('far', 15500);
  const farTraced = firstAt(far, (f) => f.tracing);
  check('a roof in another town dives again', farTraced > 3000, `${farTraced} ms`);

  // 4. A correction a few doors away: it draws in place.
  const before = await roofNow();
  let moved = false;
  for (const [dLat, dLon] of [[0.0004, 0], [0, 0.0004], [-0.0004, 0], [0, -0.0004], [0.0004, 0.0004], [-0.0004, -0.0004], [0.0007, 0], [0, 0.0007]]) {
    const r = await post({ type: 'roof_find', lat: FAR.lat + dLat, lon: FAR.lon + dLon });
    if (r?.found && (await roofNow()) !== before) {
      moved = true;
      break;
    }
  }
  check('a neighbouring building is found by a tap', moved);
  const near = moved ? await film('near', 6000) : [];
  const nearTraced = firstAt(near, (f) => f.tracing);
  if (moved) check('a building nearby is drawn in place, without a dive', nearTraced >= 0 && nearTraced < 2500, `${nearTraced} ms`);

  // 5. A landmark asked for by name, the way the agent's findBuilding tool does it.
  const named = await inPage(`fetch('/api/tools/findBuilding?sid=${sid}&dev=1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ place: 'Vidhana Soudha, Bengaluru' }) }).then((r) => r.json())`);
  check('a landmark is found by its name', !!named?.found, `${named?.place}: room for ${named?.panels_that_fit} panels`);
  const byName = named?.found ? await film('named', 15500) : [];
  const namedTraced = firstAt(byName, (f) => f.tracing);
  if (byName.length) {
    check('the view dives to the landmark', namedTraced > 3000, `${namedTraced} ms`);
    check('the picture carries its name', byName.at(-1).text.includes('Vidhana Soudha'), byName.at(-1).text);
    check('a very large roof is drawn in blocks that light up', byName.at(-1).panels > 100 && byName.at(-1).lit === byName.at(-1).panels, `${byName.at(-1).panels} blocks`);
  }

  check('the page stayed up', pageEvents.length === 0, pageEvents.join('; ').slice(0, 300));

  const pick = (frames, times) => (frames.length ? times.map((t) => nearest(frames, t)) : []);
  await sheet('reveal-1', [
    ...pick(first, [traced - 3900, traced - 3100, traced - 2400, traced - 1600, traced - 900, traced - 200, traced + 500, landing + 300, landing + 1200, landing + 4200]),
    ...pick(system, [600, 3800]),
  ]);
  await sheet('reveal-2', [...pick(far, [farTraced - 2000, farTraced + 4800]), ...pick(near, [5500]), ...pick(byName, [namedTraced - 1700, namedTraced - 200, namedTraced + 700, namedTraced + 2200, namedTraced + 6000])]);
  console.log(`\nContact sheets: ${join(out, 'reveal-1.jpg')} and reveal-2.jpg beside it`);
} catch (error) {
  check('the run finished', false, String(error?.message ?? error).slice(0, 300));
} finally {
  try {
    socket?.close();
  } catch {
    // Already closed.
  }
  chrome.kill();
  await sleep(1200);
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 400 });
  } catch {
    console.log(`Chrome's throwaway profile is still in ${profile}; it can be deleted.`);
  }
}
process.exit(results.every(Boolean) ? 0 : 1);
