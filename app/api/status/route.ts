import { NextResponse } from 'next/server';
import { publicBaseUrl } from '@/lib/dhoop/server';

/** What is configured, without revealing any secret values. The start screen uses it to warn early. */
export async function GET() {
  return NextResponse.json({
    agora: !!process.env.NEXT_PUBLIC_AGORA_APP_ID && !!process.env.NEXT_AGORA_APP_CERTIFICATE,
    murf: !!process.env.MURF_API_KEY,
    tools: !!publicBaseUrl(),
    publicBase: publicBaseUrl() ?? null,
    sampleQuotes: process.env.DHOOP_SAMPLE_QUOTES === '1',
    speakerLock: process.env.DHOOP_SPEAKER_LOCK === '1',
    // Which commit a host is running, where the host says (Render does). Not a secret: the code is public.
    build: (process.env.RENDER_GIT_COMMIT ?? process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7) || null,
  });
}
