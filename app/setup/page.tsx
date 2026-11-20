'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

interface Status {
  agora: boolean;
  murf: boolean;
  tools: boolean;
}

interface AgoraSetup {
  phase: 'idle' | 'waiting' | 'saving' | 'done' | 'error';
  message: string;
  url?: string;
}

/**
 * One-time setup. Sign in to Agora with a button, paste the Murf key, and both are written
 * to .env.local on this computer and never shown again. Works only at localhost, while developing.
 */
export default function SetupPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [agora, setAgora] = useState<AgoraSetup | null>(null);

  const refresh = useCallback(() => {
    fetch('/api/status', { cache: 'no-store' })
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => {});
    fetch('/api/setup/agora', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setAgora(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 2000);
    return () => clearInterval(id);
  }, [refresh]);

  const ready = !!status?.agora && !!status?.murf;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-5 bg-background px-4 py-8 text-foreground">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Set up Dhoop</h1>
        <p className="text-sm text-muted-foreground">Two things to do, once. Keys stay on this computer, in the file .env.local, and are not shown again.</p>
      </div>

      <Section title="1. Agora" done={status?.agora} doneText="Agora keys saved" todoText="Needed for voice">
        <AgoraSignIn saved={!!status?.agora} setup={agora} onChange={setAgora} />
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Or paste the two keys by hand</summary>
          <p className="my-2 text-muted-foreground">Copy both values from your project in Agora Console.</p>
          <KeyForm
            fields={[
              { name: 'appId', label: 'App ID', secret: false },
              { name: 'appCertificate', label: 'App Certificate', secret: true },
            ]}
            onSaved={refresh}
          />
        </details>
      </Section>

      <Section title="2. Murf voice" done={status?.murf} doneText="Murf key saved" todoText="Needed for the Murf Falcon voice">
        <p className="text-sm text-muted-foreground">
          Create a key on the{' '}
          <a className="underline underline-offset-2" href="https://murf.ai/api/dashboard" target="_blank" rel="noopener noreferrer">
            Murf API dashboard
          </a>
          , copy it, and paste it here.
        </p>
        <KeyForm fields={[{ name: 'murfKey', label: 'Murf API key', secret: true }]} onSaved={refresh} />
      </Section>

      {ready && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-50">
          Both keys are in.{' '}
          <Link href="/" className="font-semibold underline underline-offset-2">
            Open Dhoop
          </Link>{' '}
          and press Start to hear the voice.
        </div>
      )}

      <Section title="Later: public address" done={status?.tools} doneText="Public address saved" todoText="Needed for the agent to use its tools">
        <p className="text-sm text-muted-foreground">The https address where Agora can reach this app: a tunnel or a deployment. Leave it until the voice test works.</p>
        <KeyForm fields={[{ name: 'publicBaseUrl', label: 'Public address', secret: false, placeholder: 'https://example.trycloudflare.com' }]} onSaved={refresh} />
      </Section>

      <Link href="/" className="text-sm text-muted-foreground underline underline-offset-2">
        Back to Dhoop
      </Link>
    </main>
  );
}

function Section({ title, done, doneText, todoText, children }: { title: string; done?: boolean; doneText: string; todoText: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{title}</h2>
        <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${done ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100' : 'bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100'}`}>
          {done === undefined ? 'Checking…' : done ? doneText : todoText}
        </span>
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

const PRIMARY_BUTTON = 'h-9 rounded-md bg-amber-400 px-4 text-sm font-semibold text-amber-950 hover:bg-amber-300 disabled:opacity-60';

function AgoraSignIn({ saved, setup, onChange }: { saved: boolean; setup: AgoraSetup | null; onChange: (s: AgoraSetup) => void }) {
  const [busy, setBusy] = useState(false);
  const phase = setup?.phase ?? 'idle';
  const working = busy || phase === 'saving';

  const start = async () => {
    setBusy(true);
    try {
      // The app opens Agora's sign-in page in this computer's web browser.
      const res = await fetch('/api/setup/agora', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const data = (await res.json()) as AgoraSetup & { error?: string };
      onChange(res.ok ? data : { phase: 'error', message: data.error ?? 'Could not start the sign-in.' });
    } catch {
      onChange({ phase: 'error', message: 'Could not reach the app. Is it still running?' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        The button opens Agora&apos;s sign-in page in your web browser. Sign in or create a free account there. Dhoop then makes a project called &ldquo;dhoop&rdquo; in your Agora account, or reuses it, and saves its keys here.
      </p>
      {phase !== 'waiting' && (
        <div>
          <button type="button" onClick={start} disabled={working} className={PRIMARY_BUTTON}>
            {working ? 'Working…' : saved ? 'Sign in again' : 'Sign in to Agora'}
          </button>
        </div>
      )}
      {phase === 'waiting' && (
        <p role="status" className="text-sm">
          <strong>Agora&apos;s sign-in page has opened in your web browser.</strong> Sign in there; this page then updates by itself. You have about three minutes.{' '}
          {setup?.url && (
            <a href={setup.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
              It did not open? Open it here.
            </a>
          )}
        </p>
      )}
      {phase === 'saving' && (
        <p role="status" className="text-sm">
          {setup?.message}
        </p>
      )}
      {phase === 'done' && (
        <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">
          {saved ? 'Agora keys saved.' : 'Agora keys saved. Loading them…'}
        </p>
      )}
      {phase === 'error' && (
        <p role="alert" className="text-sm text-destructive">
          {setup?.message}
        </p>
      )}
    </div>
  );
}

function KeyForm({ fields, onSaved }: { fields: { name: string; label: string; secret: boolean; placeholder?: string }[]; onSaved: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fields.some((f) => (values[f.name] ?? '').trim())) return setMessage({ ok: false, text: 'Paste a value first.' });
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
      const data = await res.json();
      if (!res.ok) return setMessage({ ok: false, text: data.error ?? 'Could not save.' });
      // Clear the boxes so the key is not left on screen.
      setValues({});
      setMessage({ ok: true, text: 'Saved.' });
      setTimeout(onSaved, 1500);
    } catch {
      setMessage({ ok: false, text: 'Could not reach the app. Is it still running?' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="flex flex-col gap-2">
      {fields.map((f) => (
        <label key={f.name} className="flex flex-col gap-1 text-sm font-medium">
          {f.label}
          <input
            type={f.secret ? 'password' : 'text'}
            autoComplete="off"
            spellCheck={false}
            value={values[f.name] ?? ''}
            onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
            placeholder={f.placeholder}
            className="h-10 rounded-md border border-border bg-background px-3 font-mono text-sm"
          />
        </label>
      ))}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={busy} className={PRIMARY_BUTTON}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        {message && (
          <span role="status" className={`text-sm ${message.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-destructive'}`}>
            {message.text}
          </span>
        )}
      </div>
    </form>
  );
}
