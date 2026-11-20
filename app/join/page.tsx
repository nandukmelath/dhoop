'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Design } from '@/lib/dhoop/solar';

const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

/** The 30-second, tap-only version for everyone in the hall. It uses no voice minutes. */
export default function JoinPage() {
  const [cities, setCities] = useState<string[]>([]);
  const [city, setCity] = useState('Bengaluru');
  const [bill, setBill] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ design: Design; sunHours: number; count: number } | null>(null);

  useEffect(() => {
    fetch('/api/hall')
      .then((r) => r.json())
      .then((d) => setCities(d.cities ?? []))
      .catch(() => setCities(['Bengaluru']));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(bill);
    if (!(amount >= 100)) return setError('Enter your monthly bill in rupees, for example 2500.');
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/hall', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ city, bill: amount }) });
      const data = await res.json();
      if (!res.ok) return setError(data.error ?? 'Could not work that out. Try again.');
      setResult({ design: data.design, sunHours: data.sunHours, count: data.summary.count });
    } catch {
      setError('Could not reach the server. Check the connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-5 bg-background px-4 py-8 text-foreground">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-400 text-xl text-amber-950" aria-hidden="true">
          ☀
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Solar for your home</h1>
          <p className="text-sm text-muted-foreground">Two answers, 30 seconds</p>
        </div>
      </div>

      {!result ? (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Where is your home?
            <select value={city} onChange={(e) => setCity(e.target.value)} className="h-11 rounded-md border border-border bg-background px-3 text-base">
              {(cities.length ? cities : ['Bengaluru']).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Monthly electricity bill, in rupees
            <input inputMode="numeric" value={bill} onChange={(e) => setBill(e.target.value.replace(/[^0-9]/g, ''))} placeholder="2500" className="h-11 rounded-md border border-border bg-background px-3 text-base" />
          </label>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <button type="submit" disabled={busy} className="h-12 rounded-lg bg-amber-400 text-base font-semibold text-amber-950 hover:bg-amber-300 disabled:opacity-60">
            {busy ? 'Working it out…' : 'Show my solar'}
          </button>
          <p className="text-xs text-muted-foreground">Only your city and bill are used, to place one dot on the hall map. Nothing else is stored.</p>
        </form>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <Tile label="System" value={`${result.design.kw} kW`} sub={`${result.design.panels} panels`} />
            <Tile label="Government subsidy" value={inr(result.design.subsidy)} sub="PM Surya Ghar" />
            <Tile label="Monthly bill" value={`${inr(result.design.billBefore)} → ${inr(result.design.billAfter)}`} sub={`Saves ${inr(result.design.monthlySavings)}`} />
            <Tile label="Pays back in" value={`${result.design.paybackYears} years`} sub={`${inr(result.design.netCost)} after subsidy`} />
          </div>
          <p className="text-sm text-muted-foreground">
            {city} gets about {result.sunHours} peak sun hours a day (NASA data). These are estimates: units are guessed from your bill and the price is an assumption until an installer quotes.
          </p>
          <p className="rounded-md bg-emerald-100 px-3 py-2 text-sm font-medium text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100">You are dot number {result.count} on the hall map.</p>
          <button type="button" onClick={() => setResult(null)} className="h-11 rounded-lg border border-border text-sm font-medium hover:bg-accent">
            Try another home
          </button>
          <Link href="/wall" className="text-center text-sm text-muted-foreground underline underline-offset-2">
            See the hall map
          </Link>
        </div>
      )}
    </main>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-md bg-muted p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold leading-tight">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
