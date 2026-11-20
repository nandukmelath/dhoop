'use client';

import { useEffect, useRef, useState } from 'react';
import { isLang, SQFT_PER_M2 } from '@/lib/dhoop/config';
import { PASSBOOK, type StoryPart } from '@/lib/dhoop/passbook';
import { SUBSIDY_STEPS } from '@/lib/dhoop/steps';
import type { Session } from '@/lib/dhoop/store';
import { RoofDrawing } from './RoofDrawing';
import { SunMark } from './SunMark';
import { inr } from './useSession';

/**
 * The solar story: a household's own roof and plan as a short film, over the whole screen.
 *
 * The voice is the passbook's voice note, spoken by Murf in the conversation's language. The
 * note is written a sentence to a subject (the home, the roof, the system, the money, the
 * application, the caution), so each sentence gets a scene, and the scenes change as the voice
 * reaches them. How long a sentence takes is judged from its length, which is near enough: a
 * scene may change half a second early or late.
 *
 * Nothing here is looked up while it plays. Every figure is already in the session, so the
 * film cannot stall on a slow service in front of an audience. If the voice cannot be had, the
 * film runs silent at reading pace, with each sentence as a caption.
 */

/** A figure that counts up to its value when its scene comes on. */
function Count({ to, format = (n: number) => Math.round(n).toLocaleString('en-IN') }: { to: number; format?: (n: number) => string }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const began = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - began) / 1100);
      setShown(to * (1 - Math.pow(1 - t, 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [to]);
  return <>{format(shown)}</>;
}

const Figure = ({ label, children, sun }: { label: string; children: React.ReactNode; sun?: boolean }) => (
  <div className="min-w-0">
    <p className={`display text-5xl tabular-nums sm:text-7xl ${sun ? 'text-[hsl(var(--primary))]' : ''}`}>{children}</p>
    <p className="mt-2 text-sm font-semibold uppercase tracking-[0.14em] text-white/65 sm:text-base">{label}</p>
  </div>
);

export function Story({ sid, session, onDone }: { sid: string; session: Session; onDone: () => void }) {
  const [parts, setParts] = useState<StoryPart[] | null>(null);
  const [at, setAt] = useState(0);
  const [share, setShare] = useState(0);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  // The language the film opened in. A change of language half way does not change the film.
  const [lang] = useState(() => (isLang(session.lang) ? session.lang : 'en'));

  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let voice: HTMLAudioElement | null = null;
    // The call's microphone is turned down while the film speaks, so Dhoop does not answer its own narrator.
    window.dispatchEvent(new CustomEvent('dhoop:story', { detail: true }));
    (async () => {
      const from = `/api/plan/${encodeURIComponent(sid)}/voice?lang=${lang}&short=1`;
      const script = (await fetch(`${from}&script=1`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)) as { parts?: StoryPart[] } | null;
      if (cancelled) return;
      const list = script?.parts ?? [];
      if (!list.length) return done.current();
      setParts(list);
      const total = list.reduce((n, p) => n + p.text.length, 0);
      // Where each scene begins, as a share of the whole.
      const starts: number[] = [];
      let run = 0;
      for (const p of list) {
        starts.push(run / total);
        run += p.text.length;
      }
      const show = (now: number) => {
        setShare(now);
        let i = 0;
        while (i + 1 < starts.length && now >= starts[i + 1]) i++;
        setAt(i);
      };
      const finish = () => timers.push(setTimeout(() => !cancelled && done.current(), 2800));
      // What is driving the scenes: nothing yet, the voice, or the clock.
      let running = false;
      let voiced = false;
      // Without the voice: by the clock, at about the pace of reading aloud.
      const silent = () => {
        if (running || voiced || cancelled) return;
        running = true;
        const seconds = Math.max(14, total / 15);
        const began = performance.now();
        const tick = () => {
          if (cancelled) return;
          const now = Math.min(1, (performance.now() - began) / 1000 / seconds);
          show(now);
          if (now < 1) timers.push(setTimeout(tick, 120));
          else finish();
        };
        tick();
      };
      // Fourteen seconds is as long as a room will wait: after that the film goes on without the voice.
      timers.push(setTimeout(() => silent(), 14_000));
      // The whole clip is fetched before it plays. Played as it arrives, the browser cannot say
      // how long it is until the end, and the scenes then have nothing to keep time by.
      const clip = await fetch(from)
        .then((r) => (r.ok ? r.blob() : null))
        .catch(() => null);
      // The clock has taken over while the clip was coming: the film stays silent rather than have two things turn its pages.
      if (cancelled || running) return;
      if (!clip) return silent();
      voiced = true;
      const address = URL.createObjectURL(clip);
      timers.push(setTimeout(() => URL.revokeObjectURL(address), 120_000));
      voice = new Audio(address);
      // Should the browser still not know the length, it is judged from the words: about fourteen letters a second.
      const guess = total / 14;
      voice.addEventListener('timeupdate', () => {
        if (!voice) return;
        const length = voice.duration > 0 && Number.isFinite(voice.duration) ? voice.duration : guess;
        show(Math.min(1, voice.currentTime / length));
      });
      voice.addEventListener('ended', () => {
        show(1);
        finish();
      });
      voice.addEventListener('error', () => {
        voiced = false;
        silent();
      });
      // The title holds for a moment first: Dhoop is saying its one line in the call.
      timers.push(
        setTimeout(() => {
          if (cancelled || !voice) return;
          voice.play().catch(() => {
            voiced = false;
            silent();
          });
        }, 1200),
      );
    })();
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      try {
        voice?.pause();
      } catch {
        // Already stopped.
      }
      window.dispatchEvent(new CustomEvent('dhoop:story', { detail: false }));
    };
  }, [sid, lang]);

  // Escape closes it, as a tap on the cross does.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') done.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const w = PASSBOOK[lang];
  const d = session.design;
  const r = session.roof;
  const part = parts?.[at];
  const stagesDone = session.application ? Math.min(session.application.stagesDone, SUBSIDY_STEPS.length) : 0;

  return (
    <div className="fixed inset-0 z-[4000] flex flex-col bg-[hsl(var(--night))] text-[hsl(44_62%_97%)]" role="dialog" aria-modal="true" aria-label="Your solar story">
      <header className="flex shrink-0 items-center justify-between gap-3 px-5 py-4 sm:px-10">
        <div className="flex min-w-0 items-center gap-3">
          <SunMark state="speaking" className="h-10 w-10 shrink-0" />
          <p className="display truncate text-2xl">Dhoop</p>
        </div>
        <button type="button" onClick={() => done.current()} aria-label="Close the story" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border-2 border-white/60 text-xl font-bold hover:bg-white/10">
          ×
        </button>
      </header>

      <div className="flex min-h-0 flex-1 items-center justify-center px-5 sm:px-10">
        {!part ? (
          <SunMark state="thinking" className="h-28 w-28" />
        ) : (
          <div key={part.kind} className="story-in w-full max-w-5xl">
            {part.kind === 'hello' && (
              <div className="flex flex-col items-center text-center">
                <SunMark state="speaking" className="h-32 w-32 sm:h-44 sm:w-44" />
                {session.survey?.homeowner && session.survey.homeowner !== 'Homeowner' && <p className="mt-6 text-lg font-semibold uppercase tracking-[0.18em] text-[hsl(var(--primary))]">{session.survey.homeowner}</p>}
                <h1 className="display mt-3 text-5xl sm:text-7xl">{session.location?.label ?? w.home}</h1>
                <p className="mt-4 text-base font-semibold uppercase tracking-[0.14em] text-white/65">{w.title}</p>
              </div>
            )}
            {part.kind === 'roof' && r && (
              <div className="grid items-center gap-8 md:grid-cols-[1.2fr_1fr]">
                {r.polygon && r.polygon.length >= 3 ? <RoofDrawing ring={r.polygon} panelsFit={r.panelsFit} panelsLit={d?.panels} className="block h-auto max-h-[52vh] w-full" /> : <SunMark state="idle" className="mx-auto h-40 w-40" />}
                <div className="flex flex-col gap-8">
                  <Figure label={`sq ft · ${w.roof}`}>
                    <Count to={r.areaM2 * SQFT_PER_M2} />
                  </Figure>
                  <Figure label={w.panelsFit} sun>
                    <Count to={r.panelsFit} />
                  </Figure>
                </div>
              </div>
            )}
            {part.kind === 'system' && d && (
              <div className="grid gap-10 md:grid-cols-3">
                <Figure label={w.system}>
                  <Count to={d.kw * 10} format={(n) => (n / 10).toFixed(1).replace(/\.0$/, '')} /> kW
                </Figure>
                <Figure label={`${w.billNow} → ${w.billAfter}`}>
                  <span className="text-white/55 line-through decoration-2">{inr(d.billBefore)}</span>
                  <span className="mx-3 text-3xl sm:text-5xl">→</span>
                  <Count to={d.billAfter} format={inr} />
                </Figure>
                <Figure label={w.saving} sun>
                  <Count to={d.monthlySavings} format={inr} />
                </Figure>
              </div>
            )}
            {part.kind === 'money' && d && (
              <div className="grid gap-10 md:grid-cols-3">
                <Figure label={w.subsidy} sun>
                  − <Count to={d.subsidy} format={inr} />
                </Figure>
                <Figure label={w.youPay}>
                  <Count to={d.netCost} format={inr} />
                </Figure>
                <Figure label={w.payback}>
                  <Count to={d.paybackYears * 10} format={(n) => (n / 10).toFixed(1).replace(/\.0$/, '')} /> <span className="text-3xl sm:text-5xl">{w.years}</span>
                </Figure>
              </div>
            )}
            {part.kind === 'application' && (
              <div>
                <Figure label={w.application} sun>
                  <Count to={stagesDone} /> / {SUBSIDY_STEPS.length}
                </Figure>
                <ol className="mt-8 flex gap-2" aria-hidden="true">
                  {SUBSIDY_STEPS.map((step, i) => (
                    <li key={step.title} className={`h-5 flex-1 rounded-[3px] border-2 border-white/70 ${i < stagesDone ? 'bg-[hsl(var(--primary))]' : 'bg-transparent'}`} />
                  ))}
                </ol>
              </div>
            )}
            {part.kind === 'close' && (
              <div className="flex flex-col items-center text-center">
                <span className="stamp border-[hsl(var(--primary))] text-[hsl(var(--primary))]">{w.estimate}</span>
                <p className="display mt-8 max-w-3xl text-3xl sm:text-5xl">{w.warning}</p>
                <p className="mt-8 text-sm font-semibold uppercase tracking-[0.14em] text-white/55">Voice by Murf Falcon · Conversation on Agora</p>
              </div>
            )}
          </div>
        )}
      </div>

      <footer className="shrink-0 px-5 pb-6 pt-3 sm:px-10">
        <p className="mx-auto min-h-[3.5rem] max-w-4xl text-center text-lg leading-snug text-white/90 sm:text-xl" aria-live="polite">
          {part?.text ?? ''}
        </p>
        <div className="mx-auto mt-4 h-1.5 max-w-4xl overflow-hidden rounded-full bg-white/15">
          <div className="h-full bg-[hsl(var(--primary))] transition-[width] duration-300 ease-linear" style={{ width: `${Math.round(share * 1000) / 10}%` }} />
        </div>
      </footer>
    </div>
  );
}
