/**
 * Demo day, in one command.
 *
 * Builds Dhoop, starts it, opens a public address for it, and checks everything a call needs
 * before anyone is watching: the keys, the built app, the public address, and a tool call
 * coming in from outside the way Agora's cloud makes them. Then it prints the two addresses
 * and a code to scan, keeps the laptop awake, and stays up until Ctrl+C.
 *
 *   npm run demo                    build, start, open a public address
 *   npm run demo -- --skip-build    start the last build as it is (quicker the second time)
 *   npm run demo -- --port 3100     use another port (the next free one is taken anyway)
 *   npm run demo -- --check         do all of it, report, and stop again: a rehearsal
 *
 * The public address is a free Cloudflare quick tunnel, new every time this starts. Dhoop is
 * told it through the environment, so nothing has to be typed or saved. No secret is printed.
 */
import { spawn } from 'node:child_process';
import { Resolver } from 'node:dns';
import { existsSync, readFileSync } from 'node:fs';
import https from 'node:https';
import net from 'node:net';
import { homedir } from 'node:os';
import { join } from 'node:path';
import QRCode from 'qrcode';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const wantedPort = Number(args[args.indexOf('--port') + 1]) || 3000;
const root = process.cwd();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const children = [];
let failures = 0;
const ok = (text) => console.log(`  ok    ${text}`);
const bad = (text, help) => {
  failures += 1;
  console.log(`  FAIL  ${text}${help ? `\n        ${help}` : ''}`);
};

function stopAll() {
  for (const child of children) {
    try {
      child.kill();
    } catch {
      // Already gone.
    }
  }
}
process.on('SIGINT', () => {
  console.log('\nStopping Dhoop and closing the public address.');
  stopAll();
  process.exit(0);
});
process.on('SIGTERM', () => {
  stopAll();
  process.exit(0);
});

/** The settings in .env.local, by name. Values are used, never shown. */
function settings() {
  const file = join(root, '.env.local');
  const out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

/**
 * A port is free when nothing answers on it. Asking to listen there is not proof: with a dev
 * server listening on every address, a second listener can still take 127.0.0.1, and the
 * launcher would then talk to the dev server and think it was its own.
 */
const answersOn = (port, host) =>
  new Promise((resolve) => {
    const socket = net.connect({ port, host });
    const done = (busy) => {
      socket.destroy();
      resolve(busy);
    };
    socket.setTimeout(600, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
const portIsFree = async (port) => !(await answersOn(port, '127.0.0.1')) && !(await answersOn(port, '::1'));

/**
 * Ask the public address the way a phone on another network would: its name is looked up with
 * public name servers, not this laptop's. A tunnel's name is minutes old, and a laptop that
 * asks its own resolver too early is told "no such name" and goes on believing it.
 */
const world = new Resolver();
world.setServers(['1.1.1.1', '8.8.8.8']);
const lookup = (hostname, options, callback) =>
  world.resolve4(hostname, (error, addresses) => {
    if (error || !addresses?.length) return callback(error ?? new Error('no address'));
    if (options?.all) callback(null, addresses.map((address) => ({ address, family: 4 })));
    else callback(null, addresses[0], 4);
  });
function fromOutside(url, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve) => {
    const req = https.request(url, { method, headers, lookup, timeout: 8000 }, (res) => {
      let text = '';
      res.on('data', (c) => (text += c));
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(text);
        } catch {
          // Not JSON: a holding page while the tunnel settles.
        }
        resolve({ status: res.statusCode, json });
      });
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(null));
    if (body) req.write(body);
    req.end();
  });
}

/** Run a command to its end, quietly. Its last lines come back if it fails. */
function run(command, commandArgs) {
  return new Promise((resolve) => {
    const child = spawn(command, commandArgs, { cwd: root, env: process.env });
    let tail = '';
    const keep = (chunk) => {
      tail = (tail + chunk).slice(-2500);
    };
    child.stdout.on('data', keep);
    child.stderr.on('data', keep);
    child.on('close', (code) => resolve({ code, tail }));
  });
}

async function answers(url, options, tries = 30) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { ...options, signal: AbortSignal.timeout(6000) });
      if (res.ok) return await res.json().catch(() => ({}));
    } catch {
      // Not up yet.
    }
    await sleep(1000);
  }
  return null;
}

console.log('\nDhoop, getting ready for a demo\n');

// 1. The keys.
const env = settings();
for (const [name, why] of [
  ['NEXT_PUBLIC_AGORA_APP_ID', 'voice cannot start without it'],
  ['NEXT_AGORA_APP_CERTIFICATE', 'voice cannot start without it'],
  ['MURF_API_KEY', 'Dhoop would speak in a stand-in voice, and the passbook could not read itself out'],
  ['DHOOP_TOOL_SECRET', 'the agent could not use its tools safely'],
]) {
  if (env[name]) ok(`${name} is set`);
  else bad(`${name} is not set in .env.local`, why);
}

// 2. The build.
if (flag('--skip-build')) {
  if (existsSync(join(root, '.next', 'BUILD_ID'))) ok('using the last build');
  else bad('there is no build to start', 'Run without --skip-build once.');
} else {
  process.stdout.write('  ...   building (about half a minute)\r');
  const built = await run('npm', ['run', 'build']);
  if (built.code === 0) ok('built                                ');
  else {
    bad('the build failed', built.tail.split('\n').slice(-12).join('\n        '));
    process.exit(1);
  }
}

// 3. A port, and a public address for it.
let port = wantedPort;
while (!(await portIsFree(port))) port += 1;
if (port !== wantedPort) console.log(`  note  port ${wantedPort} is in use (a dev server?), so this uses ${port}`);

let publicBase = '';
const cloudflared = [join(homedir(), '.local', 'bin', 'cloudflared'), '/opt/homebrew/bin/cloudflared', '/usr/local/bin/cloudflared'].find((p) => existsSync(p)) ?? 'cloudflared';
const tunnel = spawn(cloudflared, ['tunnel', '--url', `http://localhost:${port}`, '--no-autoupdate'], { stdio: ['ignore', 'pipe', 'pipe'] });
children.push(tunnel);
let tunnelFailed = false;
tunnel.on('error', () => {
  tunnelFailed = true;
});
const seen = (chunk) => {
  const found = String(chunk).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (found && !publicBase) publicBase = found[0];
};
tunnel.stdout.on('data', seen);
tunnel.stderr.on('data', seen);
for (let i = 0; i < 40 && !publicBase && !tunnelFailed; i++) await sleep(500);
if (publicBase) ok(`public address open: ${publicBase}`);
else if (env.PUBLIC_BASE_URL) {
  publicBase = env.PUBLIC_BASE_URL.replace(/\/+$/, '');
  bad('no tunnel could be opened', `cloudflared was not found or did not answer. Falling back to the address saved in .env.local, which only works if it still points at this laptop.`);
} else bad('no public address', 'Install cloudflared, or set PUBLIC_BASE_URL in .env.local. Without one Dhoop can talk but cannot use its tools, and the passbook code will not open on a phone.');

// 4. The app itself, told its public address.
const app = spawn(join(root, 'node_modules', '.bin', 'next'), ['start', '-p', String(port)], { cwd: root, env: { ...process.env, PUBLIC_BASE_URL: publicBase }, stdio: ['ignore', 'pipe', 'pipe'] });
children.push(app);
let appLog = '';
let appGone = false;
app.stdout.on('data', (c) => (appLog = (appLog + c).slice(-2000)));
app.stderr.on('data', (c) => (appLog = (appLog + c).slice(-2000)));
app.on('close', () => {
  appGone = true;
});
const local = `http://localhost:${port}`;
const status = await answers(`${local}/api/status`, {}, 40);
if (!status || appGone) {
  bad('the app did not start', appLog.split('\n').slice(-8).join('\n        '));
  stopAll();
  process.exit(1);
}
ok(`Dhoop is up at ${local}`);
if (status.agora) ok('Agora keys are read');
else bad('the app does not see the Agora keys');
if (status.murf) ok('Murf key is read');
else bad('the app does not see the Murf key');

// 5. From outside, the way Agora's cloud and a judge's phone come in.
if (publicBase) {
  process.stdout.write('  ...   waiting for the public address to answer (up to two minutes)\r');
  let outside = null;
  for (let i = 0; i < 60 && outside?.status !== 200; i++) {
    await sleep(2000);
    outside = await fromOutside(`${publicBase}/api/status`);
  }
  if (outside?.status === 200) ok('the public address reaches the app                              ');
  else bad('the public address does not reach the app                           ', 'Open it in a phone browser. If it loads there, carry on; if not, stop this and start it again.');
  const billBody = JSON.stringify({ monthly_units: 310, bill_amount: 3200, source: 'spoken' });
  const tool = await fromOutside(`${publicBase}/api/tools/saveBill?sid=demo-check`, { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(billBody), 'x-dhoop-key': env.DHOOP_TOOL_SECRET ?? '' }, body: billBody });
  if (tool?.json?.ok) ok('a tool call from outside is accepted');
  else bad('a tool call from outside was refused', 'The agent would talk but could not save a bill or find a roof.');
  const stranger = await fromOutside(`${publicBase}/api/tools/saveBill?sid=demo-check`, { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': 2 }, body: '{}' });
  if (stranger?.status === 401) ok('a tool call without the secret is turned away');
  else if (stranger) bad('a tool call without the secret was not turned away');
}

console.log(failures ? `\n${failures} thing${failures > 1 ? 's' : ''} to put right above.\n` : '\nEverything a call needs is in place.\n');

if (flag('--check')) {
  stopAll();
  process.exit(failures ? 1 : 0);
}

// 6. Stay up, awake, with the addresses in plain sight.
if (process.platform === 'darwin') {
  const awake = spawn('caffeinate', ['-dimsu', '-w', String(process.pid)], { stdio: 'ignore' });
  awake.on('error', () => {});
  children.push(awake);
}
console.log(`On this laptop:   ${local}`);
if (publicBase) {
  console.log(`On any phone:     ${publicBase}\n`);
  console.log(await QRCode.toString(publicBase, { type: 'terminal', small: true }));
}
console.log(`Before the judges come:
  1. Open ${local} in Chrome and make one short call. Allow the microphone and location.
  2. A headset or earphone microphone, if the hall is loud. "Loud room: hold to talk" is on the call screen.
  3. Press End between people, and "Start a new conversation" for each new one.
  4. The code on "Take it home" opens the passbook on a judge's phone, at the public address above.

Leave this window open. Ctrl+C stops Dhoop and closes the public address.
`);
app.on('close', (code) => {
  console.log(`Dhoop stopped by itself (code ${code}). Last lines:\n${appLog.split('\n').slice(-8).join('\n')}`);
  stopAll();
  process.exit(1);
});
await new Promise(() => {});
