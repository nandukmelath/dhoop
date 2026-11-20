import { NextResponse, type NextRequest } from 'next/server';
import { isLang } from '@/lib/dhoop/config';
import { voiceNote } from '@/lib/dhoop/passbook';
import { getSession } from '@/lib/dhoop/store';
import { speak } from '@/lib/dhoop/voice';

/**
 * The passbook's voice note: the plan, spoken by Murf in the conversation's language.
 * The Murf key stays on the server, in lib/dhoop/voice.ts, which also keeps each clip once made.
 */

export async function GET(request: NextRequest, context: { params: Promise<{ sid: string }> }) {
  const { sid } = await context.params;
  const session = /^[A-Za-z0-9_-]{1,64}$/.test(sid) ? getSession(sid) : undefined;
  // "?lang=ta" has the note read in another of the six languages than the conversation's.
  const asked = new URL(request.url).searchParams.get('lang');
  // "?short=1" is the solar story's telling of it, a few seconds shorter.
  const short = !!new URL(request.url).searchParams.get('short');
  const note = session ? voiceNote(session, isLang(asked) ? asked : undefined, short) : null;
  if (!note) return NextResponse.json({ error: 'There is nothing to read out yet.' }, { status: 404 });
  // "?script=1" gives the note's sentences and what each is about, for the solar story's scenes. No sound is made.
  if (new URL(request.url).searchParams.get('script')) return NextResponse.json({ parts: note.parts }, { headers: { 'Cache-Control': 'no-store' } });
  const sound = await speak(note);
  if (sound === 'no-key') return NextResponse.json({ error: 'No Murf key is set, so the note cannot be spoken.' }, { status: 503 });
  if (!sound) return NextResponse.json({ error: 'Murf could not speak the note just now.' }, { status: 502 });
  return new NextResponse(new Uint8Array(sound), { headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': String(sound.length), 'Cache-Control': 'private, max-age=300' } });
}
