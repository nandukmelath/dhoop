'use client';

import { useEffect, useState } from 'react';

const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

interface Survey {
  sid: string;
  surveyId: string;
  homeowner: string;
  sentAt: number;
  place: string;
  monthlyUnits: number | null;
  roofSqft: number | null;
  shadePercent: number | null;
  roofMeasuredBy: string | null;
  kw: number | null;
  panels: number | null;
  quotes: { installer: string; price: number; days: number }[];
  booked: { installer: string; day: string; time: string } | null;
}

/** What an installer sees: surveys that households have sent, and a form to quote on each. */
export default function InstallerPage() {
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [company, setCompany] = useState('');

  useEffect(() => {
    setCompany(window.localStorage.getItem('dhoop-installer') ?? '');
    const load = () =>
      fetch('/api/installer', { cache: 'no-store' })
        .then((r) => r.json())
        .then((d) => setSurveys(d.surveys ?? []))
        .catch(() => {});
    void load();
    const id = setInterval(load, 2000);
    return () => clearInterval(id);
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-5 bg-background px-4 py-8 text-foreground">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Installer inbox</h1>
        <p className="text-sm text-muted-foreground">Roof surveys from households, ready to quote. New ones appear by themselves.</p>
      </div>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Your company name
        <input
          value={company}
          onChange={(e) => {
            setCompany(e.target.value);
            window.localStorage.setItem('dhoop-installer', e.target.value);
          }}
          placeholder="Sunrise Solar, Bengaluru"
          className="h-10 rounded-md border border-border bg-background px-3 text-base"
        />
      </label>

      {surveys.length === 0 ? (
        <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">No surveys yet. They arrive when a household asks Dhoop to get quotes.</p>
      ) : (
        surveys.map((s) => <SurveyCard key={s.surveyId} s={s} company={company} />)
      )}
    </main>
  );
}

function SurveyCard({ s, company }: { s: Survey; company: string }) {
  const [price, setPrice] = useState('');
  const [days, setDays] = useState('10');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company.trim()) return setMessage({ ok: false, text: 'Enter your company name at the top first.' });
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/installer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sid: s.sid, installer: company.trim(), price: Number(price), days: Number(days), note: note.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) return setMessage({ ok: false, text: data.error ?? 'Could not send the quote.' });
      setMessage({ ok: true, text: 'Quote sent. The household has been told.' });
      setPrice('');
    } catch {
      setMessage({ ok: false, text: 'Could not reach the server. Try again.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold">
          {s.homeowner}, {s.place}
        </h2>
        <span className="text-xs text-muted-foreground">{new Date(s.sentAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
        <Item k="System wanted" v={s.kw ? `${s.kw} kW, ${s.panels} panels` : 'Not sized'} />
        <Item k="Use a month" v={s.monthlyUnits ? `${s.monthlyUnits} units` : 'Unknown'} />
        <Item k="Roof" v={s.roofSqft ? `${s.roofSqft.toLocaleString('en-IN')} sq ft` : 'Not measured'} />
        <Item k="Shade" v={s.shadePercent !== null ? `${s.shadePercent}%` : 'Unknown'} />
        <Item k="Measured by" v={s.roofMeasuredBy === 'model' ? 'Table-top model' : s.roofMeasuredBy === 'satellite' ? 'Satellite view' : s.roofMeasuredBy === 'found' ? 'Building outline from satellite data' : s.roofMeasuredBy === 'spoken' ? 'Told by voice' : 'Not measured'} />
        <Item k="Quotes so far" v={String(s.quotes.length)} />
      </dl>
      {s.booked ? (
        <p className="mt-3 rounded-md bg-emerald-100 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100">
          Site visit booked with {s.booked.installer}: {s.booked.day}, {s.booked.time}.
        </p>
      ) : (
        <form onSubmit={send} className="mt-3 flex flex-wrap items-end gap-2">
          <label className="flex flex-col text-xs text-muted-foreground">
            Price before subsidy, in rupees
            <input inputMode="numeric" required value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9]/g, ''))} placeholder="165000" className="h-9 w-40 rounded-md border border-border bg-background px-2 text-sm text-foreground" />
          </label>
          <label className="flex flex-col text-xs text-muted-foreground">
            Days to install
            <input inputMode="numeric" required value={days} onChange={(e) => setDays(e.target.value.replace(/[^0-9]/g, ''))} className="h-9 w-24 rounded-md border border-border bg-background px-2 text-sm text-foreground" />
          </label>
          <label className="flex min-w-0 flex-1 flex-col text-xs text-muted-foreground">
            Note (optional)
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="25-year panel warranty" className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground" />
          </label>
          <button type="submit" disabled={busy} className="h-9 rounded-md bg-amber-400 px-3 text-sm font-semibold text-amber-950 hover:bg-amber-300 disabled:opacity-60">
            Send quote
          </button>
        </form>
      )}
      {s.quotes.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Quoted: {s.quotes.map((q) => `${q.installer} ${inr(q.price)}`).join(', ')}</p>}
      {message && (
        <p role="status" className={`mt-2 text-sm ${message.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-destructive'}`}>
          {message.text}
        </p>
      )}
    </article>
  );
}

function Item({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{k}</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  );
}
