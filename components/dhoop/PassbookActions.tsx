'use client';

import { useRef, useState } from 'react';

/**
 * What a passbook can do: read itself out, go to the family on WhatsApp, and take the person
 * back into the conversation on this phone.
 */
export function PassbookActions({ sid, lang, listen, share, talk, shareText, canListen }: { sid: string; lang: string; listen: string; share: string; talk: string; shareText: string; canListen: boolean }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'playing' | 'failed'>('idle');

  const play = async () => {
    const el = audio.current;
    if (!el) return;
    if (state === 'playing') {
      el.pause();
      return setState('idle');
    }
    setState('loading');
    try {
      await el.play();
      setState('playing');
    } catch {
      setState('failed');
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {canListen && (
        <>
          <button type="button" onClick={() => void play()} className="btn-sun h-14 w-full text-lg" aria-live="polite">
            <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
              {state === 'playing' ? <path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor" /> : <path d="M8 5v14l11-7z" fill="currentColor" />}
            </svg>
            {state === 'loading' ? '…' : listen}
          </button>
          {state === 'failed' && <p className="text-sm font-medium text-destructive">The voice note could not be played just now. Try once more.</p>}
          <audio ref={audio} src={`/api/plan/${encodeURIComponent(sid)}/voice?lang=${encodeURIComponent(lang)}`} preload="none" onEnded={() => setState('idle')} onError={() => setState('failed')} />
        </>
      )}
      <div className="grid grid-cols-2 gap-3">
        <a
          className="btn-plain h-12 px-2 text-center text-sm leading-tight"
          href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          {share}
        </a>
        <a className="btn-plain h-12 px-2 text-center text-sm leading-tight" href={`/?carry=${encodeURIComponent(sid)}&lang=${encodeURIComponent(lang)}`}>
          {talk}
        </a>
      </div>
    </div>
  );
}
