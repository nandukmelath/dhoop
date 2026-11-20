import { NextRequest, NextResponse } from 'next/server';
import { agoraSetupState, setupAllowed, startAgoraSignIn } from '@/lib/dhoop/setup';

/**
 * The "Sign in to Agora" button on the /setup page.
 * POST starts Agora's sign-in and answers with the address to open. GET says how far it has got.
 * Like the rest of setup, it works only on this computer, at localhost, while developing.
 */

const refuse = () => NextResponse.json({ error: 'Setup is only available on this computer, at localhost, while developing.' }, { status: 403 });

export async function GET(request: NextRequest) {
  if (!setupAllowed(request.headers, 'GET')) return refuse();
  return NextResponse.json(agoraSetupState(), { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  if (!setupAllowed(request.headers, 'POST')) return refuse();
  return NextResponse.json(await startAgoraSignIn());
}
