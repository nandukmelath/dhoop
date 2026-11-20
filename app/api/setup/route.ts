import { NextRequest, NextResponse } from 'next/server';
import { cleanPasted, setupAllowed, writeEnv } from '@/lib/dhoop/setup';

/**
 * Saves keys typed into the /setup page into .env.local on this machine.
 *
 * It works only while developing and only for requests made on this computer to localhost,
 * so it cannot be reached through a tunnel or on a deployed copy. It never returns a saved value.
 */

const KEY_SHAPE = /^[A-Za-z0-9._~+/=:-]{10,200}$/;
const AGORA_SHAPE = /^[0-9a-f]{32}$/i;

const FIELDS: Record<string, { env: string; check: (v: string) => string | null }> = {
  murfKey: { env: 'MURF_API_KEY', check: (v) => (KEY_SHAPE.test(v) ? null : 'That does not look like a Murf key. Paste the whole key, with no spaces.') },
  appId: { env: 'NEXT_PUBLIC_AGORA_APP_ID', check: (v) => (AGORA_SHAPE.test(v) ? null : 'An Agora App ID is 32 letters and digits.') },
  appCertificate: { env: 'NEXT_AGORA_APP_CERTIFICATE', check: (v) => (AGORA_SHAPE.test(v) ? null : 'An Agora App Certificate is 32 letters and digits.') },
  publicBaseUrl: { env: 'PUBLIC_BASE_URL', check: (v) => (/^https:\/\/[A-Za-z0-9.-]+\.[A-Za-z]{2,}(:\d+)?(\/[A-Za-z0-9._~/-]*)?$/.test(v) ? null : 'The public address must look like https://your-site.example') },
};

export async function POST(request: NextRequest) {
  if (!setupAllowed(request.headers, 'POST')) {
    return NextResponse.json({ error: 'Setup is only available on this computer, at localhost, while developing.' }, { status: 403 });
  }
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }

  const updates: Record<string, string> = {};
  for (const [field, spec] of Object.entries(FIELDS)) {
    const raw = body?.[field];
    if (typeof raw !== 'string') continue;
    let value = cleanPasted(raw);
    if (field === 'publicBaseUrl') value = value.replace(/\/+$/, '');
    if (!value) continue;
    const problem = spec.check(value);
    if (problem) return NextResponse.json({ error: problem, field }, { status: 400 });
    updates[spec.env] = value;
  }
  if (!Object.keys(updates).length) return NextResponse.json({ error: 'Nothing to save. Paste a value first.' }, { status: 400 });

  try {
    writeEnv(updates);
  } catch {
    return NextResponse.json({ error: 'Could not write the settings file.' }, { status: 500 });
  }
  // The running app picks up .env.local changes by itself while developing.
  return NextResponse.json({ ok: true, saved: Object.keys(updates) });
}
