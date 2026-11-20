'use client';

import { useState, useRef, Suspense, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import type { RTMClient } from 'agora-rtm';
import type { AgoraTokenData, ClientStartRequest, AgentResponse, AgoraRenewalTokens, PipelineLabels } from '@/types/conversation';
import { LANGS, LANG_ORDER, SCHEME_PROGRESS, type Lang } from '@/lib/dhoop/config';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { LoadingSkeleton } from '@/components/LoadingSkeleton';
import Stage, { type StageFlags } from './Stage';
import { SunMark } from './SunMark';

// Browser-only pieces, loaded on demand (same approach as Agora's starter).
const ConversationComponent = dynamic(() => import('@/components/ConversationComponent'), { ssr: false });

const AgoraProvider = dynamic(
  async () => {
    const { AgoraRTCProvider, default: AgoraRTC } = await import('agora-rtc-react');
    return {
      default: function AgoraProviders({ children }: { children: React.ReactNode }) {
        // useRef survives StrictMode's simulated remount, so only one RTC client is created.
        const clientRef = useRef<ReturnType<typeof AgoraRTC.createClient> | null>(null);
        if (!clientRef.current) clientRef.current = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
        return <AgoraRTCProvider client={clientRef.current}>{children}</AgoraRTCProvider>;
      },
    };
  },
  { ssr: false },
);

interface Status {
  agora: boolean;
  murf: boolean;
  tools: boolean;
}


/**
 * Where this browser keeps the name of its last conversation. The channel name is also the
 * session id on the server, so coming back to the same channel brings back everything Dhoop
 * saved: the bill, the roof, the design and what was said.
 */
const SAVED_KEY = 'dhoop.conversation';
const SAVED_FOR_MS = 12 * 60 * 60 * 1000;

interface SavedTalk {
  channel: string;
  /** A few words on what Dhoop remembers, for the start page. May be empty. */
  summary: string;
}

function readSavedChannel(): string | null {
  try {
    const saved = JSON.parse(window.localStorage.getItem(SAVED_KEY) ?? 'null') as { channel?: unknown; at?: unknown } | null;
    if (!saved || typeof saved.channel !== 'string' || typeof saved.at !== 'number') return null;
    if (Date.now() - saved.at > SAVED_FOR_MS || !/^[A-Za-z0-9_-]{1,64}$/.test(saved.channel)) return null;
    return saved.channel;
  } catch {
    return null;
  }
}

/** Metres between two spots, to tell a real move from a flicker in the reading. */
const metresApart = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) =>
  Math.hypot((a.lat - b.lat) * 111_320, (a.lon - b.lon) * 111_320 * Math.cos((a.lat * Math.PI) / 180));

/**
 * Share this device's live location with a conversation for as long as the call lasts, if the
 * person allows it. The server acts on the first report at once: it goes to that spot and picks
 * out the building. It acts on later ones when the device has moved. `firstReport` settles when
 * the first report has been dealt with, or straight away when there will not be one.
 * Quietly does nothing when the browser refuses or has no location.
 */
function shareLiveLocation(channel: string, onUsed: (first: boolean) => void): { stop: () => void; firstReport: Promise<void> } {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return { stop: () => {}, firstReport: Promise.resolve() };
  let sent: { lat: number; lon: number; accuracy: number } | null = null;
  let settle = () => {};
  const firstReport = new Promise<void>((resolve) => {
    settle = resolve;
  });
  const watch = navigator.geolocation.watchPosition(
    (where) => {
      const now = { lat: where.coords.latitude, lon: where.coords.longitude, accuracy: where.coords.accuracy };
      // After the first report, speak up only when the device has moved or knows much better where it is.
      if (sent && metresApart(sent, now) < 12 && now.accuracy > sent.accuracy * 0.6) return;
      const first = !sent;
      sent = now;
      void fetch(`/api/session/${encodeURIComponent(channel)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'device_location', ...now, first }),
      })
        .then((res) => res.json())
        // `used` means the server moved the home to this spot, so the agent should hear of it.
        .then((answer: { used?: boolean }) => {
          if (answer?.used) onUsed(first);
        })
        .catch(() => {})
        .finally(() => {
          if (first) settle();
        });
    },
    () => settle(),
    // maximumAge 0: a live reading, not one the browser remembered from earlier.
    { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
  );
  return { stop: () => navigator.geolocation.clearWatch(watch), firstReport };
}

function writeSavedChannel(channel: string | null) {
  try {
    if (channel) window.localStorage.setItem(SAVED_KEY, JSON.stringify({ channel, at: Date.now() }));
    else window.localStorage.removeItem(SAVED_KEY);
  } catch {
    /* A private window may refuse storage. Dhoop then starts afresh each time. */
  }
}

/** The time now. Read only from handlers that run after something happens, never while the screen is being drawn. */
const clock = () => Date.now();

export default function DhoopApp() {
  const [showConversation, setShowConversation] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agoraData, setAgoraData] = useState<AgoraTokenData | null>(null);
  const [rtmClient, setRtmClient] = useState<RTMClient | null>(null);
  const [lang, setLang] = useState<Lang>('en');
  const [camera, setCamera] = useState(true);
  const [useLocation, setUseLocation] = useState(true);
  // What the screen last told the agent on the person's behalf, and when.
  const [nudge, setNudge] = useState<{ id: number; text: string } | undefined>(undefined);
  const lastNudgeAt = useRef(0);
  /** True once the recogniser has failed in this call and listening has gone back to the plain setup. */
  const [endedQuiet, setEndedQuiet] = useState(false);
  const plainListening = useRef(false);
  // The recogniser failing in the middle of a call: whether the restart now under way is for that, how often it has happened in this call, and when the last one finished.
  const listeningFailed = useRef(false);
  const recoveries = useRef(0);
  const recoveredAt = useRef(0);
  /** What the agent was to be asked after a change of language by voice, and when. A recogniser that fails in those first seconds takes the asking with it, so it is asked again. */
  const recapOwed = useRef<{ text: string; at: number } | null>(null);
  // Stops the live location sharing of the call in progress.
  const stopLocation = useRef<() => void>(() => {});
  useEffect(() => () => stopLocation.current(), []);
  const [flags, setFlags] = useState<StageFlags>({});
  const [pipeline, setPipeline] = useState<PipelineLabels | undefined>(undefined);
  const [status, setStatus] = useState<Status | null>(null);
  const [switching, setSwitching] = useState(false);
  const [agentError, setAgentError] = useState<string | null>(null);
  // The conversation this browser was last in, if the server still remembers something of it.
  const [saved, setSaved] = useState<SavedTalk | null>(null);
  // Counts agent restarts inside one call, so the transcript can keep its earlier lines.
  const [restarts, setRestarts] = useState(0);

  /** Ask the server what it still remembers of this browser's last conversation. */
  const refreshSaved = useCallback(async () => {
    const channel = readSavedChannel();
    let found: SavedTalk | null = null;
    if (channel) {
      try {
        const s = await (await fetch(`/api/session/${encodeURIComponent(channel)}`)).json();
        const parts: string[] = [];
        if (s?.bill?.amount) parts.push(`a bill of ₹${Math.round(s.bill.amount).toLocaleString('en-IN')}`);
        if (s?.location?.label) parts.push(String(s.location.label));
        if (s?.design?.kw) parts.push(`a ${s.design.kw} kW system`);
        if (parts.length > 0 || Number(s?.remembered) > 0) {
          found = { channel, summary: parts.join(', ') };
          if (LANG_ORDER.includes(s?.lang)) setLang(s.lang as Lang);
        }
      } catch {
        /* no memory to offer; start afresh */
      }
    }
    setSaved(found);
  }, []);

  // Warm up the heavy modules and learn what is configured, before anyone clicks Start.
  useEffect(() => {
    import('agora-rtc-react').catch(() => {});
    import('agora-rtm').catch(() => {});
    fetch('/api/status')
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus(null));
    // "?carry=" comes from a solar passbook: carry on that conversation here, on this device.
    const asked = new URLSearchParams(window.location.search).get('carry');
    if (asked && /^[A-Za-z0-9_-]{1,64}$/.test(asked)) {
      writeSavedChannel(asked);
      window.history.replaceState(null, '', window.location.pathname);
    }
    void refreshSaved();
  }, [refreshSaved]);

  // If the tab is closed or reloaded mid-call, tell the server. The agent then leaves at once
  // and what was said is kept. Without this it would wait two idle minutes and forget.
  const liveAgentId = showConversation ? agoraData?.agentId : undefined;
  useEffect(() => {
    if (!liveAgentId) return;
    const onLeave = () => {
      navigator.sendBeacon('/api/stop-conversation', new Blob([JSON.stringify({ agent_id: liveAgentId })], { type: 'application/json' }));
    };
    window.addEventListener('pagehide', onLeave);
    return () => window.removeEventListener('pagehide', onLeave);
  }, [liveAgentId]);

  /** Ask the server to bring the agent into the channel, in the chosen language. */
  const inviteAgent = useCallback(
    async (uid: string, channel: string, language: Lang, resume: boolean, returning = false): Promise<AgentResponse | null> => {
      // With the microphone refused, every start uses the plainest setup.
      const plain = plainListening.current;
      try {
        const res = await fetch('/api/invite-agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // "?stt=" in the address tries another listening setup, for the listening test.
          body: JSON.stringify({ requester_id: uid, channel_name: channel, lang: language, camera, sid: channel, resume, returning, plain_listening: plain || undefined, listening_failed: listeningFailed.current || undefined, stt: new URLSearchParams(window.location.search).get('stt') ?? undefined } as ClientStartRequest),
        });
        const data = await res.json();
        if (!res.ok) {
          setAgentError(data?.error ?? 'The agent could not start.');
          return null;
        }
        setAgentError(null);
        setFlags({ toolsOn: data.tools_on, voice: data.voice });
        setPipeline(data.pipeline);
        return data as AgentResponse;
      } catch (err) {
        console.error('Failed to start the agent:', err);
        setAgentError('The agent could not start. Check the internet connection.');
        return null;
      }
    },
    [camera],
  );

  /** Start a call. It carries on the last conversation when there is one, unless `fresh` is true. */
  const handleStart = async (fresh = false) => {
    // With the microphone refused no sound reaches Agora at all, and the fuller listening setup
    // then fails every few seconds, which stalls typed messages as well. Someone who can only
    // type gets the plain setup from the start.
    plainListening.current = await navigator.permissions
      ?.query({ name: 'microphone' as PermissionName })
      .then((permission) => permission.state === 'denied')
      .catch(() => false) ?? false;
    recoveries.current = 0;
    setEndedQuiet(false);
    setIsLoading(true);
    setError(null);
    try {
      // 1. Token and channel for this browser. Carrying on uses the same channel as last time.
      const reuse = !fresh && saved ? saved.channel : null;
      if (fresh) writeSavedChannel(null);
      const tokenRes = await fetch(`/api/generate-agora-token${reuse ? `?channel=${encodeURIComponent(reuse)}` : ''}`);
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok) throw new Error(tokenData?.error ?? 'Could not get an Agora token.');
      writeSavedChannel(tokenData.channel);
      setRestarts(0);

      // Share the live location for the whole call. A new call does not wait for it: the
      // browser may still be asking the person. A call that carries on waits a moment when
      // permission is already given, so the agent starts out knowing where the person is now
      // and not where they were last time.
      stopLocation.current();
      stopLocation.current = () => {};
      setNudge(undefined);
      recapOwed.current = null;
      lastNudgeAt.current = 0;
      if (useLocation) {
        const live = shareLiveLocation(tokenData.channel, (first) => {
          // Tell the agent, so it speaks up about the building by itself. A person walking
          // about should not set it off every few steps.
          const now = Date.now();
          if (!first && now - lastNudgeAt.current < 60_000) return;
          lastNudgeAt.current = now;
          setNudge({ id: now, text: first ? '(This device has shared its live location. Find my building.)' : '(This device has moved. Find my building again.)' });
        });
        stopLocation.current = live.stop;
        if (reuse) {
          const allowed = await navigator.permissions
            ?.query({ name: 'geolocation' })
            .then((p) => p.state === 'granted')
            .catch(() => false);
          if (allowed) await Promise.race([live.firstReport, new Promise<void>((r) => setTimeout(r, 3500))]);
        }
      }

      // 2. Start the agent and sign in to messaging at the same time. A failed agent start
      //    is not fatal: the screen still opens and says what went wrong.
      const [firstTry, rtm] = await Promise.all([
        inviteAgent(tokenData.uid, tokenData.channel, lang, !!reuse, !!reuse),
        (async () => {
          const { default: AgoraRTM } = await import('agora-rtm');
          const client: RTMClient = new AgoraRTM.RTM(process.env.NEXT_PUBLIC_AGORA_APP_ID!, tokenData.uid);
          await client.login({ token: tokenData.token });
          await client.subscribe(tokenData.channel);
          return client;
        })(),
      ]);
      // When carrying on, an earlier agent may still be leaving the channel. Give it a moment.
      let agentData = firstTry;
      for (let attempt = 0; reuse && !agentData && attempt < 2; attempt++) {
        await new Promise((r) => setTimeout(r, 1500));
        agentData = await inviteAgent(tokenData.uid, tokenData.channel, lang, true, true);
      }

      setRtmClient(rtm);
      setAgoraData({ ...tokenData, agentId: agentData?.agent_id });
      setShowConversation(true);
    } catch (err) {
      console.error('Error starting:', err);
      setError(err instanceof Error ? err.message : 'Could not start. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const stopAgent = async (agentId?: string) => {
    if (!agentId) return;
    try {
      await fetch('/api/stop-conversation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agent_id: agentId }) });
    } catch (err) {
      console.error('Error stopping agent:', err);
    }
  };

  /**
   * The recogniser failed: Agora's engine says so and then hears nothing for the rest of the
   * call. One keyword in the list of names to expect can do this, and so can a bad spell at
   * the recogniser's own end. So the agent leaves and comes back with the other recogniser,
   * everything remembered, and asks the person to say it again.
   */
  const recoverListening = async () => {
    // Not with the microphone refused: no recogniser can hear a microphone that sends nothing.
    // Not more than four times in a call, and not for the old agent's last complaints, which
    // can arrive just after its replacement has taken the seat.
    if (!agoraData || switching || plainListening.current || recoveries.current >= 4 || clock() - recoveredAt.current < 8000) return;
    recoveries.current += 1;
    listeningFailed.current = true;
    await restartAgent(lang);
    listeningFailed.current = false;
    recoveredAt.current = clock();
    // A change of language by voice, moments ago, was to end with the agent saying where things
    // stand. The agent that was asked has just been replaced: ask its successor. (Seen in a real
    // call: the new language's recogniser failed to start, and the summary was never spoken.)
    const owed = recapOwed.current;
    if (owed && clock() - owed.at < 40_000) {
      await new Promise((r) => setTimeout(r, 2500));
      setNudge({ id: clock(), text: owed.text });
    }
  };

  /** Change language mid-conversation: the agent leaves and comes back speaking the new one, with everything remembered. */
  const switchLanguage = async (next: Lang) => {
    if (!agoraData || next === lang || switching) return;
    setLang(next);
    await restartAgent(next);
  };

  /** The agent leaves and a new one takes its seat in the same call. */
  const restartAgent = async (next: Lang) => {
    if (!agoraData) return;
    setSwitching(true);
    setRestarts((n) => n + 1);
    await stopAgent(agoraData.agentId);
    // Give the old agent a moment to leave before the new one takes the same seat,
    // and try again a couple of times if it has not gone yet.
    let agentData: AgentResponse | null = null;
    for (let attempt = 0; attempt < 3 && !agentData; attempt++) {
      await new Promise((r) => setTimeout(r, 1200 + attempt * 900));
      agentData = await inviteAgent(agoraData.uid, agoraData.channel, next, true);
    }
    setAgoraData((d) => (d ? { ...d, agentId: agentData?.agent_id } : d));
    setSwitching(false);
  };

  /**
   * The same change, asked for aloud ("explain it to my mother in Kannada"). The agent has just
   * said "one moment": it is given the time to finish, then it leaves, and the one that takes
   * its seat is asked to say where things stand, so whoever it was called for is brought up to
   * date. That asking waits a little, because words sent before an agent has joined are lost.
   */
  const switchByVoice = async (next: Lang) => {
    if (!agoraData || next === lang || switching) return;
    await new Promise((r) => setTimeout(r, 1800));
    await switchLanguage(next);
    const text = `(The person asked aloud to carry on in ${LANGS[next].label}, perhaps for someone else in the room. In two short sentences say where things stand so far: the roof, the system and the saving, whichever are known. Then ask what they would like to know.)`;
    recapOwed.current = { text, at: clock() };
    await new Promise((r) => setTimeout(r, 2500));
    setNudge({ id: clock(), text });
  };
  // The screen passes the asking on as an event (see `langAsk` in Stage.tsx). The newest
  // version of the function answers it, since it reads the call as it is now.
  const voiceSwitch = useRef(switchByVoice);
  useEffect(() => {
    voiceSwitch.current = switchByVoice;
  });
  useEffect(() => {
    const onAsk = (e: Event) => {
      const to = (e as CustomEvent<unknown>).detail;
      if (typeof to === 'string' && (LANG_ORDER as readonly string[]).includes(to)) void voiceSwitch.current(to as Lang);
    };
    window.addEventListener('dhoop:language', onAsk);
    return () => window.removeEventListener('dhoop:language', onAsk);
  }, []);

  const handleTokenWillExpire = useCallback(
    async (uid: string): Promise<AgoraRenewalTokens> => {
      const channel = agoraData?.channel;
      if (!channel) throw new Error('Missing channel for token renewal');
      const [rtcResponse, rtmResponse] = await Promise.all([
        fetch(`/api/generate-agora-token?channel=${channel}&uid=${uid}`),
        fetch(`/api/generate-agora-token?channel=${channel}&uid=${agoraData.uid}`),
      ]);
      const [rtcData, rtmData] = await Promise.all([rtcResponse.json(), rtmResponse.json()]);
      if (!rtcResponse.ok || !rtmResponse.ok) throw new Error('Failed to generate renewal tokens');
      return { rtcToken: rtcData.token, rtmToken: rtmData.token };
    },
    [agoraData],
  );

  const handleEnd = async () => {
    stopLocation.current();
    stopLocation.current = () => {};
    await stopAgent(agoraData?.agentId);
    rtmClient?.logout().catch((err) => console.error('RTM logout error:', err));
    setRtmClient(null);
    setShowConversation(false);
    // A call that ended itself for being left unused says so on the start page.
    try {
      setEndedQuiet(window.sessionStorage.getItem('dhoop.endedQuiet') === '1');
      window.sessionStorage.removeItem('dhoop.endedQuiet');
    } catch {
      // A private window: nothing to read.
    }
    // The start page can now offer to carry on from this conversation.
    void refreshSaved();
  };

  const langChips = (
    <div className="flex w-max items-center gap-0.5 rounded-md border-2 border-foreground bg-background p-0.5" role="group" aria-label="Conversation language">
      {LANG_ORDER.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => (showConversation ? void switchLanguage(l) : setLang(l))}
          disabled={switching}
          aria-pressed={lang === l}
          className={`rounded-[3px] px-1.5 py-1 text-[0.82rem] font-semibold disabled:opacity-60 sm:px-2 sm:text-sm ${lang === l ? 'bg-primary text-primary-foreground' : 'text-foreground/70 hover:text-foreground'}`}
        >
          {LANGS[l].native}
        </button>
      ))}
    </div>
  );

  if (showConversation && agoraData && rtmClient) {
    return (
      <div className="relative flex h-dvh min-h-screen flex-col overflow-hidden bg-background text-foreground">
        {agentError && (
          <p role="alert" className="border-b border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
            The agent did not join: {agentError}
          </p>
        )}
        {switching && (
          <p role="status" className="border-b border-border bg-muted px-4 py-2 text-sm">
            Switching to {LANGS[lang].label}…
          </p>
        )}
        <Suspense fallback={<LoadingSkeleton />}>
          <ErrorBoundary>
            <AgoraProvider>
              <ConversationComponent
                agoraData={agoraData}
                rtmClient={rtmClient}
                onTokenWillExpire={handleTokenWillExpire}
                onEndConversation={handleEnd}
                publishCamera={camera}
                headerExtras={langChips}
                pipelineLabels={pipeline}
                restartCount={restarts}
                nudge={nudge}
                onListeningFailed={() => void recoverListening()}
                stage={({ cameraTrack }) => <Stage sid={agoraData.channel} cameraTrack={cameraTrack} flags={flags} />}
              />
            </AgoraProvider>
          </ErrorBoundary>
        </Suspense>
      </div>
    );
  }

  const lakh = (n: number) => (n / 100_000).toFixed(1);
  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden bg-background text-foreground">
      {/* The sun, rising off the corner of the page. */}
      <SunMark state="listening" className="pointer-events-none absolute -right-24 -top-28 h-64 w-64 sm:-right-24 sm:-top-24 sm:h-96 sm:w-96" />

      <div className="relative mx-auto flex w-full max-w-2xl flex-1 flex-col px-5 pb-8 pt-7 sm:pt-12">
        <p className="display text-3xl">Dhoop</p>
        <h1 className="display mt-12 max-w-[10ch] text-[3.3rem] sm:mt-20 sm:max-w-[13ch] sm:text-7xl">Solar for your roof, in your language.</h1>
        <p className="mt-4 max-w-md text-lg leading-snug text-foreground/85">
          Say your electricity bill. Dhoop finds your roof from space, works out the system and the subsidy, and walks you through the application.
        </p>

        <section className="mt-8" aria-label="Conversation language">
          <p className="label-caps mb-2">Speak in</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" role="group">
            {LANG_ORDER.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLang(l)}
                aria-pressed={lang === l}
                className={`flex h-[4.25rem] flex-col items-start justify-center rounded-md border-2 border-foreground px-4 text-left ${
                  lang === l ? 'bg-primary shadow-[4px_4px_0_0_hsl(var(--foreground))]' : 'bg-card'
                }`}
              >
                <span className="text-2xl font-bold leading-none">{LANGS[l].native}</span>
                <span className="mt-1.5 text-xs font-medium leading-none text-foreground/70">{LANGS[l].label}</span>
              </button>
            ))}
          </div>
        </section>

        <div className="mt-5 flex flex-col gap-2.5 text-[0.95rem]">
          <label className="flex items-center gap-3">
            <input type="checkbox" checked={camera} onChange={(e) => setCamera(e.target.checked)} className="h-5 w-5 shrink-0 accent-[hsl(var(--foreground))]" />
            Let Dhoop see the camera
          </label>
          <label className="flex items-center gap-3">
            <input type="checkbox" checked={useLocation} onChange={(e) => setUseLocation(e.target.checked)} className="h-5 w-5 shrink-0 accent-[hsl(var(--foreground))]" />
            Let Dhoop find my building from this device&apos;s live location
          </label>
        </div>

        {endedQuiet && (
          <p role="status" className="mt-5 rounded-md border-2 border-foreground bg-accent px-4 py-3 text-sm font-medium">
            That call ended by itself after four quiet minutes, to save call time. Nothing is lost: carry on and Dhoop picks up where you stopped.
          </p>
        )}
        {saved && (
          <div className="mt-5 rounded-md border-2 border-dashed border-foreground/60 bg-card px-4 py-3 text-sm">
            <p className="font-semibold text-foreground">Dhoop remembers your last conversation{saved.summary ? `: ${saved.summary}.` : '.'}</p>
            <p className="mt-0.5 text-muted-foreground">Carry on from there, or start a new one with nothing remembered.</p>
          </div>
        )}
        <button type="button" onClick={() => void handleStart()} disabled={isLoading} className="btn-sun mt-6 h-14 w-full text-lg">
          {isLoading ? 'Starting…' : saved ? 'Carry on talking' : 'Start talking'}
        </button>
        {saved && (
          <button type="button" onClick={() => void handleStart(true)} disabled={isLoading} className="btn-plain mt-3 h-11 w-full text-sm">
            Start a new conversation
          </button>
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm font-medium text-destructive">
            {error}
          </p>
        )}

        {status && (!status.agora || !status.murf || !status.tools) && (
          <ul className="mt-5 flex flex-col gap-1.5 rounded-md border-2 border-foreground bg-accent p-3 text-sm">
            {!status.agora && <li>Agora keys are missing, so voice cannot start. Add them to .env.local (see the README).</li>}
            {status.agora && !status.murf && <li>No Murf key yet. Dhoop will use Agora&apos;s default voice until MURF_API_KEY is set.</li>}
            {status.agora && !status.tools && <li>No public address yet (PUBLIC_BASE_URL). Dhoop can talk but cannot use its tools.</li>}
          </ul>
        )}

        <footer className="mt-auto pt-10">
          <div className="border-t-2 border-foreground pt-3">
            <p className="label-caps">PM Surya Ghar, from the national portal, {SCHEME_PROGRESS.asOn}</p>
            <p className="mt-1 text-[0.95rem] leading-snug">
              <span className="font-bold">{lakh(SCHEME_PROGRESS.applications)} lakh</span> homes have applied. <span className="font-bold">{lakh(SCHEME_PROGRESS.installations)} lakh</span> have a system. Dhoop is for the homes in between.
            </p>
          </div>
          <nav className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium" aria-label="Other screens">
            <Link className="underline decoration-2 underline-offset-4" href="/wall">
              Hall map
            </Link>
            <Link className="underline decoration-2 underline-offset-4" href="/join">
              Try it by tapping
            </Link>
            <Link className="underline decoration-2 underline-offset-4" href="/installer">
              Installer inbox
            </Link>
            <Link className="underline decoration-2 underline-offset-4" href="/dev">
              Test without voice
            </Link>
          </nav>
          <p className="mt-3 text-xs text-muted-foreground">Built on Agora Conversational AI and Murf Falcon.</p>
        </footer>
      </div>
    </main>
  );
}
