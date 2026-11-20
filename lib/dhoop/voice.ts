import { createHash } from 'node:crypto';
import { voiceNote } from './passbook';
import { getSession } from './store';

/**
 * The passbook's note and the solar story's narration, spoken by Murf.
 *
 * A clip is kept once made, so a second tap on "Listen" and a family passing the phone round do
 * not ask Murf again. Two askers for the same clip while it is being made wait for the one
 * request. And the story's clip is made ahead of time, as soon as a system is worked out:
 * Murf takes eight or nine seconds over half a minute of speech, which is a long time for a
 * room to look at a title, so by the time anyone asks for the story it is ready.
 *
 * Murf allows only a few voices at once on one key: five on its US East servers and two on any
 * other, counted server by server. Dhoop's own speaking voice in the call goes through the
 * "global" address, so these clips must not crowd it. They are asked for one at a time, never
 * two together, and from the US East address, which keeps its own count. The first time this
 * was built without that, a run of tool calls set off several clips at once and one request
 * was turned away.
 *
 * Server-only: the Murf key stays here.
 */

/** Where clips are made. Not the address the call's voice uses. */
const CLIP_URL = process.env.MURF_CLIP_URL || 'https://us-east.api.murf.ai/v1/speech/stream';

type Note = { text: string; voiceId: string; locale: string };

const g = globalThis as unknown as { __dhoopClips?: Map<string, Buffer>; __dhoopClipsMaking?: Map<string, Promise<Buffer | null>>; __dhoopClipLane?: Promise<unknown>; __dhoopClipDue?: Map<string, ReturnType<typeof setTimeout>> };
const kept = () => (g.__dhoopClips ??= new Map());
const making = () => (g.__dhoopClipsMaking ??= new Map());
const due = () => (g.__dhoopClipDue ??= new Map());

/** One clip at a time: each waits for the one before it to finish, whether that one worked or not. */
function inTurn<T>(job: () => Promise<T>): Promise<T> {
  const run = (g.__dhoopClipLane ?? Promise.resolve()).then(job, job);
  g.__dhoopClipLane = run.catch(() => null);
  return run;
}

async function askMurf(note: Note, key: string): Promise<Buffer | null> {
  const res = await fetch(CLIP_URL, {
    method: 'POST',
    headers: { 'api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({ text: note.text, voiceId: note.voiceId, model: 'FALCON', multiNativeLocale: note.locale, format: 'MP3', sampleRate: 24000 }),
    signal: AbortSignal.timeout(25_000),
  }).catch(() => null);
  return res?.ok ? Buffer.from(await res.arrayBuffer()) : null;
}

/** The sound of a note. 'no-key' when there is no Murf key, null when Murf could not speak it just now. */
export function speak(note: Note): Promise<Buffer | null | 'no-key'> {
  const key = process.env.MURF_API_KEY;
  if (!key) return Promise.resolve('no-key');
  const id = createHash('sha1').update(`${note.voiceId}|${note.locale}|${note.text}`).digest('hex');
  const have = kept().get(id);
  if (have) return Promise.resolve(have);
  let wait = making().get(id);
  if (!wait) {
    wait = inTurn(() => askMurf(note, key))
      .then((sound) => {
        if (sound) {
          kept().set(id, sound);
          if (kept().size > 40) kept().delete(kept().keys().next().value as string);
        }
        return sound;
      })
      .finally(() => making().delete(id));
    making().set(id, wait);
  }
  return wait;
}

/**
 * Have the solar story's narration made, in the conversation's language, so it is ready when
 * asked for. Nothing waits on it. It is put off for a few seconds and started once, so a run of
 * tool calls (the roof grown, then moved, then the system sized again) makes one clip, of the
 * plan as it stands at the end. `now` skips the wait: the story has just been asked for.
 */
export function warmStory(sid: string, now = false) {
  if (!process.env.MURF_API_KEY) return;
  clearTimeout(due().get(sid));
  const make = () => {
    due().delete(sid);
    const s = getSession(sid);
    const note = s ? voiceNote(s, undefined, true) : null;
    if (note) void speak(note).catch(() => null);
  };
  if (now) make();
  else due().set(sid, setTimeout(make, 2500));
}
