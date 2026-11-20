/**
 * Saves Dhoop's logo files from the page that draws them (/brand), so the files and the app
 * use one drawing and one typeface. Needs the app running and Google Chrome installed.
 *   npm run brand
 *   npm run brand -- http://localhost:3001
 */
import { execFileSync, spawn } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const APP = process.argv[2] ?? 'http://localhost:3000';
const PORT = 9341;
const FILES = {
  mark: 'dhoop-mark-1024.png',
  icon: 'dhoop-icon-1024.png',
  'icon-night': 'dhoop-icon-night-1024.png',
  favicon: 'dhoop-favicon-512.png',
  logo: 'dhoop-logo.png',
  'logo-paper': 'dhoop-logo-on-paper.png',
  'logo-night': 'dhoop-logo-on-night.png',
  stacked: 'dhoop-logo-stacked-1024.png',
  social: 'dhoop-social-1200x630.png',
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'dhoop-brand-'));
mkdirSync('brand', { recursive: true });
mkdirSync('public/brand', { recursive: true });
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--window-size=2000,1400', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
let ws;
let id = 0;
const waiting = new Map();
const send = (method, params = {}) =>
  new Promise((done, fail) => {
    const n = ++id;
    waiting.set(n, { done, fail });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
const inPage = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value;
try {
  let url;
  for (let i = 0; i < 60 && !url; i++) {
    try {
      url = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page')?.webSocketDebuggerUrl;
    } catch {}
    if (!url) await sleep(200);
  }
  ws = new WebSocket(url);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    const w = msg.id && waiting.get(msg.id);
    if (!w) return;
    waiting.delete(msg.id);
    if (msg.error) w.fail(new Error(msg.error.message));
    else w.done(msg.result);
  };
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 2000, height: 1400, deviceScaleFactor: 1, mobile: false });
  // Nothing behind the drawings: the files that are meant to be see-through then are.
  await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  await send('Page.navigate', { url: `${APP}/brand` });
  await sleep(2500);
  await inPage(`(async () => { document.documentElement.style.background = 'transparent'; document.body.style.background = 'transparent'; await document.fonts.ready; await Promise.all(['800 100px "Anek Latin"', '600 44px "Anek Latin"'].map((f) => document.fonts.load(f).catch(() => null))); return document.fonts.size; })()`);
  await sleep(1200);
  for (const [block, file] of Object.entries(FILES)) {
    const box = await inPage(`(() => { const r = document.getElementById(${JSON.stringify(block)})?.getBoundingClientRect(); return r ? { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height } : null; })()`);
    if (!box) throw new Error(`The page has no block called ${block}.`);
    const shot = await send('Page.captureScreenshot', { format: 'png', clip: { ...box, scale: 1 }, captureBeyondViewport: true });
    writeFileSync(join('brand', file), Buffer.from(shot.data, 'base64'));
    console.log(`brand/${file}  ${box.width} x ${box.height}`);
  }
  // What the site itself serves: the link preview, and the small icons a browser tab, a phone's
  // home screen and a bookmark show. `sips` is the Mac's own picture tool.
  copyFileSync('brand/dhoop-social-1200x630.png', 'public/brand/dhoop-social-1200x630.png');
  const sized = (from, px, to) => execFileSync('sips', ['-s', 'format', 'png', '-z', String(px), String(px), from, '--out', to], { stdio: 'ignore' });
  sized('brand/dhoop-icon-1024.png', 180, 'public/apple-touch-icon.png');
  sized('brand/dhoop-icon-1024.png', 192, 'public/android-chrome-192x192.png');
  sized('brand/dhoop-icon-1024.png', 512, 'public/android-chrome-512x512.png');
  sized('brand/dhoop-favicon-512.png', 32, 'public/favicon-32x32.png');
  sized('brand/dhoop-favicon-512.png', 16, 'public/favicon-16x16.png');
  sized('brand/dhoop-favicon-512.png', 48, join(profile, 'favicon-48.png'));
  // favicon.ico: one file holding the 16, 32 and 48 pixel pictures, each kept as a PNG.
  const pictures = [[16, 'public/favicon-16x16.png'], [32, 'public/favicon-32x32.png'], [48, join(profile, 'favicon-48.png')]].map(([px, file]) => ({ px, data: readFileSync(file) }));
  const head = Buffer.alloc(6 + 16 * pictures.length);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(pictures.length, 4);
  let at = head.length;
  pictures.forEach(({ px, data }, i) => {
    const entry = 6 + 16 * i;
    head.writeUInt8(px, entry);
    head.writeUInt8(px, entry + 1);
    head.writeUInt16LE(1, entry + 4);
    head.writeUInt16LE(32, entry + 6);
    head.writeUInt32LE(data.length, entry + 8);
    head.writeUInt32LE(at, entry + 12);
    at += data.length;
  });
  writeFileSync('public/favicon.ico', Buffer.concat([head, ...pictures.map((p) => p.data)]));
  console.log('public: favicon.ico, favicon-16x16.png, favicon-32x32.png, apple-touch-icon.png, android-chrome-192x192.png, android-chrome-512x512.png');
} catch (error) {
  console.error('Could not make the logo files:', String(error?.message ?? error));
  process.exitCode = 1;
} finally {
  try {
    ws?.close();
  } catch {}
  chrome.kill();
  await sleep(800);
  rmSync(profile, { recursive: true, force: true, maxRetries: 6, retryDelay: 300 });
}
