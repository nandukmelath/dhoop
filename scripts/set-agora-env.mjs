/**
 * Puts the Agora App ID and App Certificate into .env.local without showing them.
 * It reads the output of Agora's command-line tool from standard input:
 *
 *   agora project env --with-secrets | node scripts/set-agora-env.mjs
 *
 * Only two lines of .env.local are touched. Everything else in the file is kept.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, '.env.local');
const examplePath = join(root, 'env.local.example');

let input = '';
for await (const chunk of process.stdin) input += chunk;

const read = (names) => {
  for (const name of names) {
    const m = input.match(new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=\\s*["']?([^"'\\r\\n]+)["']?\\s*$`, 'm'));
    if (m && m[1].trim()) return m[1].trim();
  }
  return '';
};
const appId = read(['AGORA_APP_ID', 'NEXT_PUBLIC_AGORA_APP_ID', 'APP_ID']);
const cert = read(['AGORA_APP_CERTIFICATE', 'NEXT_AGORA_APP_CERTIFICATE', 'APP_CERTIFICATE']);

if (!appId || !cert) {
  console.error(`Could not find both values in the input (App ID found: ${appId ? 'yes' : 'no'}, certificate found: ${cert ? 'yes' : 'no'}).`);
  console.error('Sign in with "agora login", select a project with "agora project use <name>", and try again.');
  process.exit(1);
}

let env = existsSync(envPath) ? readFileSync(envPath, 'utf8') : existsSync(examplePath) ? readFileSync(examplePath, 'utf8') : '';
const set = (text, key, value) => {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  return re.test(text) ? text.replace(re, line) : `${text.replace(/\s*$/, '')}\n${line}\n`;
};
env = set(env, 'NEXT_PUBLIC_AGORA_APP_ID', appId);
env = set(env, 'NEXT_AGORA_APP_CERTIFICATE', cert);
writeFileSync(envPath, env);
console.log('Agora App ID written to .env.local: yes');
console.log('Agora App Certificate written to .env.local: yes');
