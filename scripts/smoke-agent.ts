/**
 * A live check to run before a demo. For each language it starts one real Dhoop agent through
 * the running app, reads its status from Agora, asks it to speak, and stops it. Nobody is in
 * the channel, so each language costs a few seconds of agent time.
 *
 * Needs the app running (npm run dev, or npm run start) and the keys in .env.local.
 * Run with: npm run smoke         every language
 *           npm run smoke -- kn   one language
 * It prints statuses only, never a key.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isLang, LANGS, type Lang } from '../lib/dhoop/config';
import { agoraAuth, agoraClient, requireEnv } from '../lib/dhoop/server';

const BASE = (process.env.DHOOP_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

function loadEnv() {
  let text = '';
  try {
    text = readFileSync(join(process.cwd(), '.env.local'), 'utf8');
  } catch {
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (m && m[2] && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function post(path: string, body: unknown) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    /* not JSON */
  }
  return { status: res.status, data, text };
}

async function check(lang: Lang, hide: (s: unknown) => string): Promise<boolean> {
  const name = LANGS[lang].label;
  const channel = `smoke${lang}${Math.floor(Date.now() / 1000)}`;
  const started = await post('/api/invite-agent', { requester_id: '10001', channel_name: channel, lang });
  const agentId = typeof started.data.agent_id === 'string' ? started.data.agent_id : '';
  if (started.status !== 200 || !agentId) {
    console.log(`${name}: could not start. HTTP ${started.status} ${hide(started.text).replace(/\s+/g, ' ').slice(0, 400)}`);
    return false;
  }

  const client = agoraClient();
  const appid = requireEnv('NEXT_PUBLIC_AGORA_APP_ID');
  let ok = false;
  try {
    let status = '';
    for (let tries = 0; tries < 3 && status !== 'RUNNING'; tries += 1) {
      await wait(3000);
      status = String((await client.agents.get({ appid, agentId }, agoraAuth())).status ?? '');
    }
    // The same call Dhoop makes when a quote arrives.
    await client.agents.speak({ appid, agentId, text: 'Dhoop is checking its voice.', priority: 'APPEND', interruptable: true }, agoraAuth());
    ok = status === 'RUNNING';
    console.log(`${name}: status ${status}; voice ${String(started.data.voice)}; tools ${started.data.tools_on ? 'on' : 'off'}; speak accepted`);
  } catch (error) {
    console.log(`${name}: started, then failed. ${hide(error instanceof Error ? error.message : error).replace(/\s+/g, ' ').slice(0, 400)}`);
  } finally {
    const stopped = await post('/api/stop-conversation', { agent_id: agentId });
    if (stopped.status !== 200) {
      ok = false;
      console.log(`${name}: could not stop the agent (HTTP ${stopped.status}). It leaves by itself after two idle minutes.`);
    }
  }
  return ok;
}

async function main() {
  loadEnv();
  const secrets = ['NEXT_AGORA_APP_CERTIFICATE', 'MURF_API_KEY', 'DHOOP_TOOL_SECRET', 'NEXT_PUBLIC_AGORA_APP_ID']
    .map((key) => process.env[key])
    .filter((value): value is string => !!value);
  const hide = (s: unknown) => secrets.reduce((text, secret) => text.split(secret).join('<hidden>'), String(s));

  const asked = process.argv.slice(2).filter(isLang);
  const langs = asked.length ? asked : (Object.keys(LANGS) as Lang[]);
  let failed = 0;
  for (const lang of langs) {
    if (!(await check(lang, hide))) failed += 1;
  }
  console.log(failed ? `${failed} of ${langs.length} failed.` : `All ${langs.length} passed.`);
  process.exitCode = failed ? 1 : 0;
}

main().catch((error) => {
  console.error('The live check could not run:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
