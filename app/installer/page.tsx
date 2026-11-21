'use client';

import { useEffect, useState } from 'react';
import { LEAD_POINTS, LEAD_TIERS, type Lead, type Tier } from '@/lib/dhoop/lead';

const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

/** How each rating is shown. The words carry it; the colour only helps. */
const TIER: Record<Tier, { label: string; cls: string }> = {
  high: { label: 'High intent', cls: 'border-emerald-700 bg-emerald-100 text-emerald-950' },
  medium: { label: 'Medium intent', cls: 'border-amber-600 bg-amber-100 text-amber-950' },
  low: { label: 'Low intent', cls: 'border-border bg-muted text-foreground' },
};

/** A household still deciding: as much as may be shown of one that was not passed on. */
interface Deciding {
  sample?: boolean;
  tier: Tier;
  score: number;
  town: string;
  kw: number | null;
  heldBy?: string;
}

interface Survey {
  /** A household that does not exist, shown to fill the inbox. It is marked wherever it appears. */
  sample?: boolean;
  lead?: Lead;
  orderValue?: number | null;
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

/** The mark every sample carries, so nobody takes one for a customer. */
function SampleMark() {
  return <span className="rounded border-2 border-dashed border-foreground px-1.5 text-[0.7rem] font-bold uppercase tracking-wider">Sample</span>;
}

/** What an installer sees: surveys that households have sent, and a form to quote on each. */
export default function InstallerPage() {
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [deciding, setDeciding] = useState<Deciding[]>([]);
  const [samples, setSamples] = useState<{ surveys: Survey[]; deciding: Deciding[] }>({ surveys: [], deciding: [] });
  const [showSamples, setShowSamples] = useState(true);
  const [company, setCompany] = useState('');

  useEffect(() => {
    setCompany(window.localStorage.getItem('dhoop-installer') ?? '');
    setShowSamples(window.localStorage.getItem('dhoop-samples') !== '0');
    const load = () =>
      fetch('/api/installer', { cache: 'no-store' })
        .then((r) => r.json())
        .then((d) => {
          setSurveys(d.surveys ?? []);
          setDeciding(d.deciding ?? []);
          setSamples({ surveys: d.samples?.surveys ?? [], deciding: d.samples?.deciding ?? [] });
        })
        .catch(() => {});
    void load();
    const id = setInterval(load, 2000);
    return () => clearInterval(id);
  }, []);

  // Real households and samples in one list, the likeliest first. Every sample keeps its mark.
  const cards = [...surveys, ...(showSamples ? samples.surveys : [])].sort((a, b) => (b.lead?.score ?? 0) - (a.lead?.score ?? 0));
  const still = [...deciding, ...(showSamples ? samples.deciding : [])].sort((a, b) => b.score - a.score);
  const sampleCount = showSamples ? samples.surveys.length + samples.deciding.length : 0;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-5 bg-background px-4 py-8 text-foreground">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Installer inbox</h1>
        <p className="text-sm text-muted-foreground">Roof surveys from households, ready to quote, with the likeliest to go ahead first. New ones appear by themselves.</p>
        <details className="mt-2 text-xs text-muted-foreground">
          <summary className="cursor-pointer font-medium text-foreground">How a lead is rated</summary>
          <p className="mt-1">
            Dhoop adds up points for what the household did and asked in its conversation. {LEAD_TIERS.high} or more is high intent, {LEAD_TIERS.medium} to {LEAD_TIERS.high - 1} is medium, less is low. A visit booked: {LEAD_POINTS.visitBooked}. Feasibility approved on the
            portal: {LEAD_POINTS.feasibilityApproved}. Quotes asked for: {LEAD_POINTS.quotesAsked}. Applied on the portal: {LEAD_POINTS.applied}, or registered: {LEAD_POINTS.registered}. The bill, the roof and a designed system: {LEAD_POINTS.bill} each. All four subsidy conditions met:{' '}
            {LEAD_POINTS.conditionsMet}. The loan and the vendors asked about: {LEAD_POINTS.loan} each. Smaller signs make up the rest. The points are a first judgement and have not been checked against real sales.
          </p>
        </details>
      </div>

      <Summary cards={cards} still={still} sampleCount={sampleCount} />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-medium">
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
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            checked={showSamples}
            onChange={(e) => {
              setShowSamples(e.target.checked);
              window.localStorage.setItem('dhoop-samples', e.target.checked ? '1' : '0');
            }}
          />
          Show sample households
        </label>
      </div>

      {sampleCount > 0 && (
        <p className="rounded-md border-2 border-dashed border-foreground px-3 py-2 text-sm">
          <SampleMark /> marks {sampleCount} households that do not exist. They show what a full inbox looks like, and each is rated by the same code as a real conversation. Untick the box to see real households only.
        </p>
      )}

      {cards.length === 0 ? (
        <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">No surveys yet. They arrive when a household asks Dhoop to get quotes.</p>
      ) : (
        cards.map((s) => <SurveyCard key={s.surveyId} s={s} company={company} />)
      )}

      {still.length > 0 && (
        <section className="rounded-lg border border-border p-4">
          <h2 className="text-base font-semibold">
            Still deciding: {still.length} more {still.length === 1 ? 'household' : 'households'}
          </h2>
          <p className="text-xs text-muted-foreground">They have not asked for quotes, so Dhoop has not passed them on. You see a town, a size, the rating and what holds them back, and nothing that names them.</p>
          <ul className="mt-2 flex flex-col gap-2 text-sm">
            {still.map((d, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className={`rounded border px-1.5 text-xs font-bold ${TIER[d.tier].cls}`}>
                  {TIER[d.tier].label} · {d.score}
                </span>
                <span className="font-medium">
                  {d.town}
                  {d.kw ? `, ${d.kw} kW` : ''}
                </span>
                {d.heldBy && <span className="text-muted-foreground">{d.heldBy}</span>}
                {d.sample && <SampleMark />}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

/** The inbox at a glance: how many of each rating, and what the open leads are worth. */
function Summary({ cards, still, sampleCount }: { cards: Survey[]; still: Deciding[]; sampleCount: number }) {
  const tiers = [...cards.map((c) => c.lead?.tier ?? 'low'), ...still.map((d) => d.tier)];
  if (tiers.length === 0) return null;
  const count = (t: Tier) => tiers.filter((x) => x === t).length;
  // Worth quoting now: the households that asked for quotes and are rated high or medium.
  const open = cards.filter((c) => c.lead && c.lead.tier !== 'low' && c.orderValue);
  const worth = open.reduce((sum, c) => sum + (c.orderValue ?? 0), 0);
  const sizes = [...cards.map((c) => c.kw), ...still.map((d) => d.kw)].filter((k): k is number => !!k);
  const average = sizes.length ? Math.round((sizes.reduce((a, b) => a + b, 0) / sizes.length) * 10) / 10 : null;
  return (
    <section className="rounded-lg border-2 border-foreground bg-card p-4">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-5">
        <Item k="High intent" v={String(count('high'))} />
        <Item k="Medium" v={String(count('medium'))} />
        <Item k="Low" v={String(count('low'))} />
        <Item k="Worth quoting now" v={open.length ? `${inr(worth)} in ${open.length}` : 'Nothing yet'} />
        <Item k="Usual system" v={average ? `${average} kW` : 'Not sized'} />
      </dl>
      {sampleCount > 0 && <p className="mt-2 text-xs text-muted-foreground">These figures include {sampleCount} sample households.</p>}
    </section>
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
    <article className={`rounded-lg bg-card p-4 ${s.sample ? 'border-2 border-dashed border-foreground/60' : 'border border-border'}`}>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="flex flex-wrap items-baseline gap-2 text-base font-semibold">
          {s.sample ? s.place : `${s.homeowner}, ${s.place}`}
          {s.sample && <SampleMark />}
        </h2>
        <span className="text-xs text-muted-foreground">{new Date(s.sentAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      {s.lead && (
        <div className={`mb-3 rounded-md border-2 px-3 py-2 ${TIER[s.lead.tier].cls}`}>
          <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm font-bold">
            <span>
              {TIER[s.lead.tier].label} · {s.lead.score} of 100
            </span>
            <span className="font-medium">{s.lead.next}</span>
          </p>
          <ul className="mt-1 list-disc pl-5 text-xs">
            {s.lead.reasons.slice(0, 4).map((r) => (
              <li key={r.text}>
                {r.text} <span className="opacity-70">+{r.points}</span>
              </li>
            ))}
          </ul>
          {s.lead.pitch && (
            <p className="mt-2 border-t border-current/30 pt-2 text-sm">
              <span className="font-bold">How to open: </span>
              {s.lead.pitch}
            </p>
          )}
        </div>
      )}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
        <Item k="System wanted" v={s.kw ? `${s.kw} kW, ${s.panels} panels` : 'Not sized'} />
        <Item k="Order value" v={s.orderValue ? `about ${inr(s.orderValue)}` : 'Not sized'} />
        <Item k="Use a month" v={s.monthlyUnits ? `${s.monthlyUnits} units` : 'Unknown'} />
        <Item k="Roof" v={s.roofSqft ? `${s.roofSqft.toLocaleString('en-IN')} sq ft, ${s.shadePercent ?? 0}% shade` : 'Not measured'} />
        <Item k="Measured by" v={s.roofMeasuredBy === 'model' ? 'Table-top model' : s.roofMeasuredBy === 'satellite' ? 'Satellite view' : s.roofMeasuredBy === 'found' ? 'Building outline from satellite data' : s.roofMeasuredBy === 'spoken' ? 'Told by voice' : 'Not measured'} />
        <Item k="Quotes so far" v={String(s.quotes.length)} />
        {(s.lead?.insights ?? []).map((i) => (
          <Item key={i.label} k={i.label} v={i.value} />
        ))}
      </dl>
      {s.booked ? (
        <p className="mt-3 rounded-md bg-emerald-100 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100">
          Site visit booked with {s.booked.installer}: {s.booked.day}, {s.booked.time}.
        </p>
      ) : s.sample ? (
        <p className="mt-3 text-xs text-muted-foreground">A sample household: there is nobody to send a quote to.</p>
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
