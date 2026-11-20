'use client';

import { useEffect, useMemo, useState } from 'react';

const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

interface Summary {
  count: number;
  totalKw: number;
  monthlySavings: number;
  subsidy: number;
  entries: { id: string; city: string; lat: number; lon: number; kw: number }[];
}

// The drawing area covers India: longitude 67 to 98, latitude 6 to 37.
const BOX = { lonMin: 67, lonMax: 98, latMin: 6, latMax: 37, w: 620, h: 640 };
const px = (lon: number) => ((lon - BOX.lonMin) / (BOX.lonMax - BOX.lonMin)) * BOX.w;
const py = (lat: number) => BOX.h - ((lat - BOX.latMin) / (BOX.latMax - BOX.latMin)) * BOX.h;

/**
 * The hall map for the big screen. Every person who taps in their city and bill becomes a
 * dot. It is drawn as dots and city names only, with no borders, on purpose.
 */
export default function WallPage() {
  const [data, setData] = useState<Summary | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [joinUrl, setJoinUrl] = useState('');

  useEffect(() => {
    const load = () =>
      fetch('/api/hall', { cache: 'no-store' })
        .then((r) => r.json())
        .then(setData)
        .catch(() => {});
    void load();
    const id = setInterval(load, 2000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const url = `${window.location.origin}/join`;
    setJoinUrl(url);
    import('qrcode').then((QR) => QR.toDataURL(url, { margin: 1, width: 360 }).then(setQr)).catch(() => setQr(null));
  }, []);

  // One label per city, with how many homes it has.
  const cities = useMemo(() => {
    const m = new Map<string, { city: string; lat: number; lon: number; n: number }>();
    for (const e of data?.entries ?? []) {
      const c = m.get(e.city);
      if (c) c.n += 1;
      else m.set(e.city, { city: e.city, lat: e.lat, lon: e.lon, n: 1 });
    }
    return [...m.values()].sort((a, b) => b.n - a.n);
  }, [data]);

  return (
    <main className="grid min-h-dvh gap-6 bg-background p-6 text-foreground lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <section aria-label="Map of homes" className="flex items-center justify-center rounded-xl border border-border bg-card p-4">
        <svg viewBox={`0 0 ${BOX.w} ${BOX.h}`} className="h-full max-h-[86vh] w-full" role="img" aria-label={`${data?.count ?? 0} homes placed by city`}>
          {(data?.entries ?? []).map((e) => (
            <circle key={e.id} cx={px(e.lon)} cy={py(e.lat)} r={5 + Math.min(e.kw, 6)} fill="#f59e0b" fillOpacity="0.55" stroke="#b45309" strokeWidth="1" />
          ))}
          {cities.slice(0, 14).map((c) => (
            <text key={c.city} x={px(c.lon) + 12} y={py(c.lat) + 4} fontSize="15" fill="currentColor">
              {c.city}
              {c.n > 1 ? ` (${c.n})` : ''}
            </text>
          ))}
          {(data?.count ?? 0) === 0 && (
            <text x={BOX.w / 2} y={BOX.h / 2} textAnchor="middle" fontSize="20" fill="currentColor" opacity="0.6">
              Scan the code to put your home here
            </text>
          )}
        </svg>
      </section>

      <section aria-label="Totals" className="flex flex-col justify-center gap-5">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">This hall, on solar</h1>
          <p className="mt-1 text-lg text-muted-foreground">Every dot is someone here who checked their own home.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Big label="Homes" value={(data?.count ?? 0).toLocaleString('en-IN')} />
          <Big label="Solar designed" value={`${(data?.totalKw ?? 0).toLocaleString('en-IN')} kW`} />
          <Big label="Saved each month" value={inr(data?.monthlySavings ?? 0)} />
          <Big label="Subsidy to claim" value={inr(data?.subsidy ?? 0)} />
        </div>
        <div className="flex items-center gap-5 rounded-xl border border-border bg-card p-4">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="QR code that opens the 30-second version" className="h-40 w-40 rounded-md bg-white p-1" />
          ) : (
            <div className="flex h-40 w-40 items-center justify-center rounded-md bg-muted text-sm text-muted-foreground">QR code</div>
          )}
          <div className="min-w-0">
            <p className="text-xl font-semibold">Scan to add your home</p>
            <p className="text-sm text-muted-foreground">Two answers, 30 seconds. Estimates only.</p>
            <p className="mt-2 break-all font-mono text-sm">{joinUrl}</p>
          </div>
        </div>
      </section>
    </main>
  );
}

function Big({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-4xl font-semibold leading-tight tracking-tight">{value}</p>
    </div>
  );
}
