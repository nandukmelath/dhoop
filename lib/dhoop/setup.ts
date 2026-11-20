import { spawn, type ChildProcess } from 'node:child_process';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { isLocalRequest, requestHost } from './local';

/**
 * Behind the /setup page: a guard that keeps it to this computer, a writer for .env.local,
 * and the Agora sign-in, run through Agora's command-line tool.
 *
 * Nothing in this file returns or logs a secret. Keys go from Agora's tool, or from the
 * form, straight into .env.local.
 */

/** Name of the Agora project the sign-in creates or reuses. */
export const AGORA_PROJECT = 'dhoop';

// ---------------------------------------------------------------------------
// Guard
// ---------------------------------------------------------------------------

/**
 * True only for requests made on this computer, to localhost, while developing.
 * Requests that arrive through a tunnel are refused, and so are changes sent by another
 * website that happens to be open in the same browser.
 */
export function setupAllowed(headers: Headers, method = 'GET'): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  if (!isLocalRequest(headers)) return false;
  if (method === 'GET') return true;
  const host = requestHost(headers);

  // A JSON body cannot be sent across sites without the browser asking first.
  if (!(headers.get('content-type') ?? '').toLowerCase().includes('application/json')) return false;
  const site = headers.get('sec-fetch-site');
  if (site && site !== 'same-origin') return false;
  const origin = headers.get('origin');
  if (origin) {
    try {
      if (new URL(origin).host.toLowerCase() !== host) return false;
    } catch {
      return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// .env.local
// ---------------------------------------------------------------------------

/** Tidies a pasted value: surrounding spaces and quotes, and a whole "NAME=value" line. */
export function cleanPasted(raw: string): string {
  return raw
    .trim()
    .replace(/^(?:export\s+)?[A-Z][A-Z0-9]*_[A-Z0-9_]*\s*=\s*/, '')
    .replace(/^["'`]+|["'`]+$/g, '')
    .trim();
}

/** Sets lines in .env.local, keeping everything else in the file as it is. */
export function writeEnv(updates: Record<string, string>, dir = process.cwd()): void {
  const envPath = join(dir, '.env.local');
  const examplePath = join(dir, 'env.local.example');
  let env = existsSync(envPath) ? readFileSync(envPath, 'utf8') : existsSync(examplePath) ? readFileSync(examplePath, 'utf8') : '';
  for (const [key, value] of Object.entries(updates)) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(key) || /[\r\n]/.test(value)) throw new Error('Refusing to write an unsafe setting.');
    const line = `${key}=${value}`;
    const re = new RegExp(`^${key}=.*$`, 'm');
    env = re.test(env) ? env.replace(re, () => line) : `${env.replace(/\s*$/, '')}\n${line}\n`;
  }
  writeFileSync(envPath, env, { mode: 0o600 });
  try {
    // The file holds keys, so only this user account may read it.
    chmodSync(envPath, 0o600);
  } catch {
    /* not every file system supports this */
  }
}

// ---------------------------------------------------------------------------
// Agora's command-line tool
// ---------------------------------------------------------------------------

function agoraCli(): string | null {
  const places = [process.env.AGORA_CLI, join(homedir(), '.local/bin/agora'), '/opt/homebrew/bin/agora', '/usr/local/bin/agora'];
  return places.find((p): p is string => !!p && existsSync(p)) ?? null;
}

/** The tool gets only what it needs from the environment, not this app's keys. */
function childEnv(): NodeJS.ProcessEnv {
  const keep = ['HOME', 'PATH', 'USER', 'LOGNAME', 'LANG', 'LC_ALL', 'TMPDIR', 'SHELL', 'XDG_CONFIG_HOME', 'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'https_proxy', 'http_proxy', 'no_proxy'];
  const env: Record<string, string> = { NO_COLOR: '1' };
  for (const key of keep) {
    const value = process.env[key];
    if (value) env[key] = value;
  }
  return env as unknown as NodeJS.ProcessEnv;
}

interface RunResult {
  code: number;
  out: string;
  err: string;
}

function run(cli: string, args: string[], timeoutMs = 60_000): Promise<RunResult> {
  return new Promise((resolve) => {
    let out = '';
    let err = '';
    const child = spawn(/*turbopackIgnore: true*/ cli, args, { stdio: ['ignore', 'pipe', 'pipe'], env: childEnv() });
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
    child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (err += chunk.toString()));
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ code: 127, out, err: String(error) });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, out, err });
    });
  });
}

/** A short reason a command failed, safe to show. Pass stderrOnly for commands whose output holds keys. */
function problemOf(result: RunResult, stderrOnly = false): string {
  const sources = stderrOnly ? [result.err] : [result.out, result.err];
  for (const text of sources) {
    try {
      const message = (JSON.parse(text) as { error?: { message?: unknown } })?.error?.message;
      if (typeof message === 'string' && message) return tidy(message);
    } catch {
      /* not JSON */
    }
  }
  const firstLine = result.err.split(/\r?\n/).find((line) => line.trim()) ?? '';
  return tidy(firstLine);
}

const tidy = (text: string) =>
  text
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/g, 'your account')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);

/** True when a project list from the tool contains a project with exactly this name. */
export function hasProjectNamed(jsonText: string, name: string): boolean {
  let data: unknown;
  try {
    data = JSON.parse(jsonText);
  } catch {
    return false;
  }
  const want = name.toLowerCase();
  const walk = (node: unknown): boolean => {
    if (Array.isArray(node)) return node.some(walk);
    if (!node || typeof node !== 'object') return false;
    const o = node as Record<string, unknown>;
    for (const key of ['name', 'projectName', 'project_name']) {
      const value = o[key];
      if (typeof value === 'string' && value.toLowerCase() === want) return true;
    }
    return Object.values(o).some(walk);
  };
  return walk(data);
}

/** Picks the App ID and App Certificate out of the tool's KEY=value output, whatever prefix the names carry. */
export function parseAgoraEnv(text: string): { appId?: string; certificate?: string } {
  const found: { appId?: string; certificate?: string } = {};
  for (const raw of text.split(/\r?\n/)) {
    const m = raw.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toUpperCase();
    const value = m[2].trim().replace(/^["']|["']$/g, '');
    if (!/^[0-9A-Za-z]{20,64}$/.test(value)) continue;
    if (key.includes('CERT')) found.certificate ??= value;
    else if (/APP_?ID$/.test(key)) found.appId ??= value;
  }
  return found;
}

// ---------------------------------------------------------------------------
// Sign-in flow
// ---------------------------------------------------------------------------

export type SetupPhase = 'idle' | 'waiting' | 'saving' | 'done' | 'error';

export interface AgoraSetupState {
  phase: SetupPhase;
  message: string;
  /** Agora's sign-in address, present only while waiting for the sign-in. */
  url?: string;
}

interface Slot {
  state: AgoraSetupState;
  login?: ChildProcess;
  doneAt?: number;
}

// Kept on globalThis so it survives the reloads Next.js does while developing.
function slot(): Slot {
  const g = globalThis as unknown as { __dhoopSetup?: Slot };
  return (g.__dhoopSetup ??= { state: { phase: 'idle', message: '' } });
}

function set(phase: SetupPhase, message: string, url?: string): AgoraSetupState {
  slot().state = { phase, message, ...(url ? { url } : {}) };
  return slot().state;
}

/** How far the sign-in has got. A finished sign-in is forgotten if the keys are later removed from the settings. */
export function agoraSetupState(): AgoraSetupState {
  const s = slot();
  const keysLoaded = !!process.env.NEXT_PUBLIC_AGORA_APP_ID && !!process.env.NEXT_AGORA_APP_CERTIFICATE;
  if (s.state.phase === 'done' && !keysLoaded && Date.now() - (s.doneAt ?? 0) > 15_000) s.state = { phase: 'idle', message: '' };
  return s.state;
}

const isAgoraAddress = (url: string) => {
  try {
    const host = new URL(url).hostname;
    return host === 'agora.io' || host.endsWith('.agora.io');
  } catch {
    return false;
  }
};

/**
 * Starts Agora's sign-in, which opens in the web browser. When the person finishes signing
 * in, the project keys are fetched and saved without anyone having to copy them.
 */
export async function startAgoraSignIn(): Promise<AgoraSetupState> {
  const s = slot();
  if (s.state.phase === 'saving') return s.state;
  if (s.state.phase === 'waiting' && s.login && s.login.exitCode === null) return s.state;

  const cli = agoraCli();
  if (!cli) return set('error', "Agora's command-line tool is not on this computer. Paste the two keys by hand instead.");

  // Already signed in, for example from a terminal? Then go straight to the keys.
  const status = await run(cli, ['auth', 'status', '--json'], 20_000);
  if (status.code === 0) {
    const state = set('saving', 'Already signed in. Getting your project keys…');
    void saveAgoraKeys(cli);
    return state;
  }

  return new Promise((resolve) => {
    let text = '';
    let answered = false;
    const answer = (state: AgoraSetupState) => {
      if (answered) return;
      answered = true;
      resolve(state);
    };
    // The tool opens the sign-in page in this computer's own web browser and also prints its
    // address, which the setup page offers as a link in case nothing opened.
    const child = spawn(/*turbopackIgnore: true*/ cli, ['login', '--no-color'], { stdio: ['ignore', 'pipe', 'pipe'], env: childEnv() });
    s.login = child;
    const hardStop = setTimeout(() => child.kill('SIGTERM'), 6 * 60_000);
    const waitingText = "Agora's sign-in page has opened in your web browser.";
    // The tool normally prints the address at once. If it has not, the browser has still been
    // asked to open, so say so and keep waiting.
    const noAddress = setTimeout(() => answer(set('waiting', waitingText)), 5_000);

    let seenAddress = false;
    const onData = (chunk: Buffer) => {
      if (seenAddress) return;
      text += chunk.toString();
      // Wait for the whole address: it ends where the line ends.
      const url = text.match(/https:\/\/\S+(?=\s)/)?.[0];
      if (!url) return;
      seenAddress = true;
      clearTimeout(noAddress);
      // Offer the address as a link only when it really is Agora's.
      answer(set('waiting', waitingText, isAgoraAddress(url) ? url : undefined));
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', () => {
      clearTimeout(hardStop);
      clearTimeout(noAddress);
      answer(set('error', "Agora's command-line tool could not be started. Paste the two keys by hand instead."));
    });
    child.on('close', (code) => {
      clearTimeout(hardStop);
      clearTimeout(noAddress);
      if (s.login === child) s.login = undefined;
      if (code === 0) {
        const state = set('saving', 'Signed in. Getting your project keys…');
        void saveAgoraKeys(cli);
        answer(state);
      } else if (slot().state.phase === 'waiting' || !answered) {
        answer(set('error', 'The sign-in was not finished in time. Press the button to try again.'));
      }
    });
  });
}

/** Creates or reuses the project, then writes its App ID and App Certificate to .env.local. */
async function saveAgoraKeys(cli: string): Promise<void> {
  const name = AGORA_PROJECT;
  try {
    const problems: string[] = [];
    const create = async () => {
      const made = await run(cli, ['project', 'create', name, '--json', '--yes'], 180_000);
      if (made.code !== 0) problems.push(problemOf(made));
    };

    const list = await run(cli, ['project', 'list', '--keyword', name, '--page-size', '50', '--json']);
    const listed = list.code === 0 && hasProjectNamed(list.out, name);
    if (!listed) await create();

    let use = await run(cli, ['project', 'use', name, '--json', '--yes']);
    if (use.code !== 0 && listed) {
      await create();
      use = await run(cli, ['project', 'use', name, '--json', '--yes']);
    }
    if (use.code !== 0) problems.push(problemOf(use));

    const env = await run(cli, ['project', 'env', '--with-secrets', '--format', 'dotenv', '--project', name]);
    const keys = parseAgoraEnv(env.out);
    if (!keys.appId || !keys.certificate) {
      // Never include this command's output: it is where the keys are.
      const why = problems.find(Boolean) ?? problemOf(env, true);
      set('error', `You are signed in, but the project keys could not be fetched${why ? ` (${why})` : ''}. Try again, or paste the two keys by hand.`);
      return;
    }
    writeEnv({ NEXT_PUBLIC_AGORA_APP_ID: keys.appId, NEXT_AGORA_APP_CERTIFICATE: keys.certificate });
    slot().doneAt = Date.now();
    set('done', 'Agora keys saved.');
  } catch {
    set('error', 'Something went wrong while saving the keys. Try again, or paste the two keys by hand.');
  }
}
