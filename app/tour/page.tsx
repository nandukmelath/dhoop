'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import Stage from '@/components/dhoop/Stage';
import { SunMark } from '@/components/dhoop/SunMark';
import { TOUR_SCRIPT } from '@/lib/dhoop/tour';

/**
 * A minute of Dhoop with no microphone: ten things a household says, each answered by the
 * tool the voice agent would call, run for real while the visitor watches. See lib/dhoop/tour.ts
 * for why it exists and what it is careful not to be.
 */
export default function TourPage() {
  const [sid, setSid] = useState<string | null>(null);
  const [lines, setLines] = useState<{ says: string; did?: string; ok?: boolean }[]>([]);
  const [at, setAt] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const paused = useRef(false);
  const [isPaused, setIsPaused] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const list = useRef<HTMLOListElement | null>(null);

  // A tour of one's own each time: nothing is kept from the last visitor's.
  useEffect(() => {
    setSid(`tour-${Math.random().toString(36).slice(2, 10)}`);
    return () => clearTimeout(timer.current);
  }, []);

  const run = async (index: number, session: string) => {
    const step = TOUR_SCRIPT[index];
    if (!step) return setOver(true);
    setAt(index);
    setBusy(true);
    setLines((was) => [...was, { says: step.says }]);
    const answer = (await fetch(`/api/tour/${session}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ step: index }) })
      .then((r) => r.json())
      .catch(() => null)) as { ok?: boolean; did?: string; error?: string } | null;
    setLines((was) => was.map((line, i) => (i === was.length - 1 ? { ...line, did: answer?.did ?? answer?.error ?? 'No answer came back.', ok: !!answer?.ok } : line)));
    setBusy(false);
    if (index === TOUR_SCRIPT.length - 1) return setOver(true);
    const next = () => (paused.current ? (timer.current = setTimeout(next, 500)) : void run(index + 1, session));
    timer.current = setTimeout(next, step.hold * 1000);
  };

  // The newest line stays in view as the list grows.
  useEffect(() => {
    list.current?.lastElementChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [lines]);

  const started = at >= 0;
  return (
    <main className="min-h-dvh bg-background p-4 text-foreground md:p-6">
      <header className="mx-auto mb-4 flex max-w-6xl flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <SunMark state={busy ? 'thinking' : started && !over ? 'speaking' : 'idle'} className="h-11 w-11 shrink-0" />
          <div className="min-w-0">
            <h1 className="display text-2xl">Dhoop in a minute</h1>
            <p className="text-sm text-muted-foreground">No microphone needed. Each step runs the same tool the voice agent calls, live, on this server.</p>
          </div>
        </div>
        <Link href="/" className="btn-plain px-4 py-2 text-sm">
          Talk to it yourself
        </Link>
      </header>

      <section className="mx-auto mb-4 max-w-6xl">
        {!started ? (
          <div className="slab bg-card p-5">
            <p className="text-base leading-relaxed">
              Dhoop is a voice guide for rooftop solar, in six Indian languages. In a call, a household speaks and Dhoop answers aloud. Here the household&apos;s words are written out instead, and you watch what Dhoop does with each:{' '}
              {TOUR_SCRIPT.length} steps, about a minute and a half, ending in a short film with sound.
            </p>
            <button type="button" className="btn-sun mt-4 h-12 px-6 text-base" disabled={!sid} onClick={() => sid && void run(0, sid)}>
              Start the tour
            </button>
          </div>
        ) : (
          <div className="slab bg-card p-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="label-caps">
                Step {Math.min(at + 1, TOUR_SCRIPT.length)} of {TOUR_SCRIPT.length}
              </p>
              {over ? (
                <Link href="/" className="btn-sun px-4 py-1.5 text-sm">
                  Now talk to it yourself
                </Link>
              ) : (
                <button
                  type="button"
                  className="btn-plain px-3 py-1 text-sm"
                  onClick={() => {
                    paused.current = !paused.current;
                    setIsPaused(paused.current);
                  }}
                >
                  {isPaused ? 'Carry on' : 'Pause'}
                </button>
              )}
            </div>
            <ol ref={list} className="flex max-h-56 flex-col gap-2 overflow-y-auto pr-1 text-sm" aria-live="polite">
              {lines.map((line, i) => (
                <li key={i} className={i === lines.length - 1 ? '' : 'opacity-70'}>
                  <p>
                    <span className="label-caps mr-1.5">Household</span>
                    {line.says}
                  </p>
                  <p className="mt-0.5 font-semibold">
                    <span className="label-caps mr-1.5">Dhoop</span>
                    {line.did ?? 'Working it out…'}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        )}
      </section>

      {sid && started && (
        <div className="mx-auto max-w-6xl">
          <Stage sid={sid} cameraTrack={null} flags={{}} />
        </div>
      )}
    </main>
  );
}
