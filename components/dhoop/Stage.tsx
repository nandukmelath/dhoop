'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { LOAN, LONG_RUN, SQFT_PER_M2, SUBSIDY } from '@/lib/dhoop/config';
import { inLakh, longRun } from '@/lib/dhoop/longrun';
import { askedCovered, bestHour, clockSaid, powerFrom, shareSaid, unitsFromHours, usualCovered } from '@/lib/dhoop/power';
import { dailyYieldPerKw, throughTheYear, type Design } from '@/lib/dhoop/solar';
import type { PlaceRow, RoofNow, Session, SiteDetails, SiteSearch, Street, SunWeek, VendorsShown } from '@/lib/dhoop/store';
import { ELIGIBILITY_CHECKS, eligibilityVerdict, FRAUD_WARNING, HELPLINE, KEEP_READY, SUBSIDY_STEPS } from '@/lib/dhoop/steps';
import ModelRoof from './ModelRoof';
import { Story } from './Story';
import { inr, useSession } from './useSession';

// The map library touches `window`, so it loads in the browser only.
const SatelliteRoof = dynamic(() => import('./SatelliteRoof'), { ssr: false, loading: () => <p className="text-sm text-muted-foreground">Loading the satellite view…</p> });

export interface StageFlags {
  toolsOn?: boolean;
  voice?: 'murf' | 'default';
}

/** The big screen: everything the agent does shows up here as it happens. */
export default function Stage({ sid, cameraTrack, flags }: { sid: string; cameraTrack: MediaStreamTrack | null; flags?: StageFlags }) {
  const { session, post, offline } = useSession(sid);
  // The satellite view comes first: Dhoop finds the building there by itself. The camera
  // survey measures whatever the camera sees, so it runs only when someone opens its tab,
  // as on stage with the model roof.
  const [tab, setTab] = useState<'camera' | 'satellite'>('satellite');

  // Follow the roof to wherever it was measured.
  useEffect(() => {
    if (session?.roof?.source === 'satellite' || session?.roof?.source === 'found') setTab('satellite');
  }, [session?.roof?.source]);

  // The satellite view is rebuilt around a building when Dhoop finds one, and around the home
  // when its place first becomes known. Corners being drawn by hand are left alone otherwise.
  const foundRoof = session?.roof?.source === 'found' ? session.roof.polygon : undefined;
  // The area is part of the key: a roof redrawn by voice can keep its first corner and its number of corners.
  const roofKey = foundRoof
    ? `found:${foundRoof.length}:${foundRoof[0]?.join(',')}:${Math.round((session?.roof?.areaM2 ?? 0) * 10)}`
    : session?.location
      ? `at:${session.location.lat.toFixed(4)},${session.location.lon.toFixed(4)}`
      : 'nowhere';

  // A roof with an outline is one the satellite view can show with panels on it. The first one
  // this screen shows flies in from the whole of India, and so does any later one somewhere
  // else. A correction nearby (a tap on the next building, a few steps down the road) is
  // drawn in place, without the flight.
  const shownRoof = session?.roof?.polygon && session.roof.polygon.length >= 3 ? session.roof : undefined;
  const roofLat = shownRoof?.polygon ? shownRoof.polygon.reduce((sum, p) => sum + p[0], 0) / shownRoof.polygon.length : 0;
  const roofLon = shownRoof?.polygon ? shownRoof.polygon.reduce((sum, p) => sum + p[1], 0) / shownRoof.polygon.length : 0;
  const [roofSeen, setRoofSeen] = useState<{ key: string; lat: number; lon: number; fly: boolean } | null>(null);
  if (shownRoof && roofSeen?.key !== roofKey) {
    const km = roofSeen ? Math.hypot((roofSeen.lat - roofLat) * 111, (roofSeen.lon - roofLon) * 111 * Math.cos((roofLat * Math.PI) / 180)) : Infinity;
    setRoofSeen({ key: roofKey, lat: roofLat, lon: roofLon, fly: km > 1.5 });
  }
  const flyIn = !!shownRoof && (roofSeen?.key === roofKey ? roofSeen.fly : true);

  // The solar story plays when it is asked for: once for each asking, and not for one found
  // lying in a session opened minutes later.
  const storyKey = session?.story?.key;
  const storyAt = session?.story?.at ?? 0;
  const storySeen = useRef<string | undefined>(undefined);
  const [storyOpen, setStoryOpen] = useState(false);
  useEffect(() => {
    if (!storyKey || storyKey === storySeen.current) return;
    storySeen.current = storyKey;
    if (Date.now() - storyAt < 120_000) setStoryOpen(true);
  }, [storyKey, storyAt]);

  // "Carry on in Kannada", asked aloud: the call screen is told, once for each asking. What was
  // already in the session when this screen opened is old news, and no clock is compared, because
  // a phone's clock and the server's can differ by more than the few seconds this takes.
  const langKey = session ? (session.langAsk?.key ?? '') : undefined;
  const langTo = session?.langAsk?.to;
  const langSeen = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (langKey === undefined) return;
    if (langSeen.current === undefined) {
      langSeen.current = langKey;
      return;
    }
    if (!langKey || langKey === langSeen.current) return;
    langSeen.current = langKey;
    if (langTo) window.dispatchEvent(new CustomEvent('dhoop:language', { detail: langTo }));
  }, [langKey, langTo]);

  return (
    <div className="grid gap-4 pb-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      {storyOpen && session && <Story sid={sid} session={session} onDone={() => setStoryOpen(false)} />}
      <section aria-label="Roof" className="flex min-w-0 flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="display text-xl">Your roof</h2>
          <div className="flex rounded-md border-2 border-foreground bg-background p-0.5 text-sm" role="tablist" aria-label="How to measure the roof">
            {(['satellite', 'camera'] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`rounded-[3px] px-3 py-1 font-semibold ${tab === t ? 'bg-foreground text-background' : 'text-foreground/70 hover:text-foreground'}`}
              >
                {t === 'camera' ? 'Camera survey' : 'From space'}
              </button>
            ))}
          </div>
        </div>
        {tab === 'camera' ? (
          <ModelRoof cameraTrack={cameraTrack} post={post} panelsFit={session?.roof?.source === 'model' ? session.roof.panelsFit : undefined} />
        ) : (
          <SatelliteRoof
            key={roofKey}
            post={post}
            start={session?.location ? { lat: session.location.lat, lon: session.location.lon } : undefined}
            saved={session?.roof?.polygon}
            found={session?.roof?.source === 'found'}
            device={session?.device}
            roof={shownRoof}
            design={session?.design}
            flyIn={flyIn}
            site={session?.site}
            street={session?.street}
            loadStreet={() =>
              fetch(`/api/street/${encodeURIComponent(sid)}`)
                .then((r) => (r.ok ? r.json() : null))
                .then((j) => (Array.isArray(j?.rings) ? (j.rings as [number, number][][]) : null))
            }
          />
        )}
        {session?.roof && <RoofSummary session={session} />}
        <Feed session={session} />
      </section>

      <section aria-label="Numbers" className="flex min-w-0 flex-col gap-3">
        {offline && <Banner tone="warn">Lost contact with the server. Numbers on this screen may be stale.</Banner>}
        {flags?.toolsOn === false && (
          <Banner tone="warn">Tools are off because no public address is set (PUBLIC_BASE_URL). Dhoop can talk but cannot calculate. See the README.</Banner>
        )}
        {flags?.voice === 'default' && <Banner tone="warn">No Murf key found, so this is Agora&apos;s default voice. Add MURF_API_KEY for the Murf Falcon voice.</Banner>}

        <BillCard session={session} post={post} />
        {session?.compare ? <CompareCard a={session.compare.a} b={session.compare.b} /> : session?.design ? <DesignCard d={session.design} session={session} /> : <EmptyDesign session={session} />}
        {session?.longRun && session.design && <LongRunCard key={session.longRun.key} d={session.design} rise={session.longRun.priceRisePercent} />}
        {session?.now && <NowCard key={session.now.key} now={session.now} kw={session.design?.kw ?? 1} designed={!!session.design} />}
        {session?.week && <WeekCard key={session.week.key} week={session.week} kw={session.design?.kw ?? 1} designed={!!session.design} tariff={session.design?.tariff} />}
        {session?.places && <PlacesCard rows={session.places.rows} reason={session.places.reason} forKw={session.places.forKw} />}
        {session?.site && <SiteCard site={session.site} />}
        {session?.vendors && <VendorsCard key={session.vendors.key} v={session.vendors} />}
        {session?.street && <StreetCard st={session.street} />}
        {session && (session.design || session.roof) && <TakeHomeCard sid={sid} />}
        {session && (session.stepsShown || session.application) && <ApplicationCard session={session} />}
        {session?.survey && <QuotesCard session={session} />}
      </section>
    </div>
  );
}

function Banner({ tone, children }: { tone: 'warn' | 'info'; children: React.ReactNode }) {
  return (
    <p role="status" className={`rounded-md border px-3 py-2 text-sm ${tone === 'warn' ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100' : 'border-border bg-muted text-foreground'}`}>
      {children}
    </p>
  );
}

function Card({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-md border-2 border-foreground bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3 border-b-2 border-dotted border-foreground/30 pb-2">
        <h2 className="display text-xl">{title}</h2>
        {right}
      </div>
      {children}
    </div>
  );
}

function Chip({ children, tone = 'plain' }: { children: React.ReactNode; tone?: 'plain' | 'good' | 'sun' }) {
  const cls =
    tone === 'good'
      ? 'border-2 border-[hsl(var(--leaf))] bg-[hsl(var(--leaf)/0.12)] text-[hsl(var(--leaf))]'
      : tone === 'sun'
        ? 'border-2 border-foreground bg-primary text-primary-foreground'
        : 'border-2 border-foreground/30 text-foreground/80';
  return <span className={`inline-flex items-center rounded-[4px] px-2 py-0.5 text-xs font-semibold ${cls}`}>{children}</span>;
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-md border-2 border-foreground/15 bg-background p-3">
      <p className="label-caps">{label}</p>
      <p className="display mt-1 text-[1.7rem] tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function BillCard({ session, post }: { session: Session | null; post: (u: Record<string, unknown>) => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const [units, setUnits] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const bill = session?.bill;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!(Number(units) > 0) && !(Number(amount) > 0)) return setError('Enter the units or the amount.');
    setError(null);
    await post({ type: 'bill_form', monthlyUnits: Number(units) || 0, amount: Number(amount) || 0 });
    setOpen(false);
  };
  return (
    <Card
      title="Electricity bill"
      right={bill ? <Chip tone="good">{bill.source === 'camera' ? 'Read by camera' : bill.source === 'spoken' ? 'Told by voice' : 'Typed in'}</Chip> : undefined}
    >
      {bill ? (
        <div className="grid grid-cols-3 gap-2">
          <Tile label="Used a month" value={`${bill.monthlyUnits.toLocaleString('en-IN')} units`} />
          <Tile label="Paid a month" value={inr(bill.amount)} />
          <Tile label="Per unit" value={`₹${bill.tariff}`} />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Tell Dhoop your monthly bill, or hold the bill up to the camera.</p>
      )}
      <button type="button" onClick={() => setOpen((o) => !o)} className="mt-3 text-xs font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground">
        {open ? 'Close' : 'Type the bill instead'}
      </button>
      {open && (
        <form onSubmit={submit} className="mt-2 flex flex-wrap items-end gap-2">
          <label className="flex flex-col text-xs text-muted-foreground">
            Units a month
            <input inputMode="numeric" value={units} onChange={(e) => setUnits(e.target.value)} placeholder="310" className="h-9 w-28 rounded-md border border-border bg-background px-2 text-sm text-foreground" />
          </label>
          <label className="flex flex-col text-xs text-muted-foreground">
            Amount in rupees
            <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="3200" className="h-9 w-28 rounded-md border border-border bg-background px-2 text-sm text-foreground" />
          </label>
          <button type="submit" className="h-9 rounded-md border border-border px-3 text-sm font-medium hover:bg-accent">
            Save bill
          </button>
          {error && <p className="w-full text-xs text-destructive">{error}</p>}
        </form>
      )}
    </Card>
  );
}

function daysLeft(): number {
  return Math.max(0, Math.ceil((new Date(SUBSIDY.schemeCloses + 'T23:59:59+05:30').getTime() - Date.now()) / 86_400_000));
}

/**
 * Take it home: a code that opens the solar passbook on the person's own phone, with the plan,
 * a voice note in their language and a way back into this conversation.
 */
function TakeHomeCard({ sid }: { sid: string }) {
  const [code, setCode] = useState<{ url: string; picture: string } | null>(null);
  useEffect(() => {
    let live = true;
    (async () => {
      // A laptop is reached from a phone at its public address, not at "localhost".
      const base = await fetch('/api/status').then((r) => r.json()).then((j) => (typeof j?.publicBase === 'string' ? j.publicBase : null)).catch(() => null);
      const url = `${base ?? window.location.origin}/plan/${sid}`;
      const QR = await import('qrcode');
      const picture = await QR.toDataURL(url, { margin: 1, width: 320, color: { dark: '#1f1a14', light: '#fdf9ee' } });
      if (live) setCode({ url, picture });
    })().catch(() => {});
    return () => {
      live = false;
    };
  }, [sid]);
  return (
    <div className="slab flex items-center gap-4 bg-primary p-4">
      {code ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={code.picture} alt="A code that opens your solar passbook on a phone" width={112} height={112} className="h-28 w-28 shrink-0 rounded-[4px] border-2 border-foreground max-sm:hidden" />
      ) : (
        <div className="h-28 w-28 shrink-0 rounded-[4px] border-2 border-foreground bg-card max-sm:hidden" />
      )}
      <div className="min-w-0">
        <h2 className="display text-2xl">Take it home</h2>
        <p className="mt-1 text-sm font-medium leading-snug">
          <span className="max-sm:hidden">Scan to open your solar passbook on your phone: </span>
          <span className="sm:hidden">Your solar passbook: </span>
          the plan, a voice note in your language, and Dhoop to carry on with.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1">
          <a className="text-sm font-bold underline decoration-2 underline-offset-4" href={code?.url ?? `/plan/${sid}`} target="_blank" rel="noopener noreferrer">
            Open the passbook
          </a>
          <button
            type="button"
            className="text-sm font-bold underline decoration-2 underline-offset-4"
            onClick={() => void fetch(`/api/session/${encodeURIComponent(sid)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'story' }) })}
          >
            Play the story
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyDesign({ session }: { session: Session | null }) {
  return (
    <Card title="Your solar system" right={<Chip tone="sun">Scheme closes in {daysLeft()} days</Chip>}>
      <p className="text-sm text-muted-foreground">
        {session?.bill ? 'Next, tell Dhoop where the home is and show the roof. The design appears here.' : 'The size, the subsidy, the saving and the payback appear here as you talk.'}
      </p>
    </Card>
  );
}

/** Named places side by side: what the same panels make in each. */
function PlacesCard({ rows, reason, forKw }: { rows: PlaceRow[]; reason: string; forKw?: number }) {
  const best = rows[0]?.yieldKwhPerKw || 1;
  return (
    <Card title="Which place is better for solar" right={<Chip tone="sun">{rows.length} compared</Chip>}>
      <ul className="flex flex-col gap-2.5">
        {rows.map((r, i) => (
          <li key={r.label}>
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-semibold">{r.label}</p>
              <p className="display text-lg tabular-nums">
                {(forKw ? Math.round(r.yieldKwhPerKw * forKw) : r.yieldKwhPerKw).toLocaleString('en-IN')} <span className="text-xs font-medium text-muted-foreground">units a year{forKw ? `, ${forKw} kW` : ' per kW'}</span>
              </p>
            </div>
            <div className="mt-1 h-3 rounded-[2px] border-2 border-foreground bg-card">
              <div className={`h-full ${i === 0 ? 'bg-primary' : 'bg-primary/45'}`} style={{ width: `${Math.round((r.yieldKwhPerKw / best) * 100)}%` }} />
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {r.sunHours} sun hours a day on panels{r.tiltDeg !== undefined ? ` tilted ${r.tiltDeg}°` : ''}{r.tempC !== undefined ? ` · ${r.tempC}°C on average` : ''}
              {i > 0 ? ` · ${r.behindPercent}% behind` : ' · the best'}
            </p>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm leading-snug">{reason}</p>
      <p className="mt-2 text-xs text-muted-foreground">Long-term yield of fixed panels at the best tilt, from the Global Solar Atlas (World Bank, data by Solargis).</p>
    </Card>
  );
}

/** Where to build a solar farm: the places compared, why the first one won, and what was not checked. */
function SiteCard({ site }: { site: SiteSearch }) {
  const many = (n: number) => (n >= 1e7 ? `${(n / 1e7).toFixed(1)} crore` : n >= 1e5 ? `${(n / 1e5).toFixed(1)} lakh` : Math.round(n).toLocaleString('en-IN'));
  return (
    <Card title={`Where to build a ${site.capacityMw} MW solar farm`} right={<Chip tone="sun">{site.compared} places compared</Chip>}>
      <ol className="flex flex-col gap-2">
        {site.picks.map((p, i) => (
          <li key={`${p.lat},${p.lon}`} className={`flex items-baseline gap-3 rounded-md border-2 px-3 py-2 ${i === 0 ? 'border-foreground bg-primary/30' : 'border-foreground/25'}`}>
            <span className="display text-xl">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold leading-snug">{/^a spot/.test(p.name) ? p.name.replace(/^a spot /, '') : `Near ${p.name}`}</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {p.yieldKwhPerKw.toLocaleString('en-IN')} units a year from each kW · {p.sunHours} sun hours a day on tilted panels
                {p.buildings !== undefined ? ` · ${p.buildings} building${p.buildings === 1 ? '' : 's'} within 300 m` : ''}
              </p>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <Tile label="Land" value={`${site.acres} acres`} sub={`a ${site.sideM} m square, marked`} />
        <Tile label="Energy a year" value={`${many(site.unitsAYear)} units`} />
        <Tile label="CO₂ kept out" value={`${site.co2TonnesAYear.toLocaleString('en-IN')} t`} sub="a year" />
      </div>
      <p className="label-caps mt-4">Why the first one</p>
      <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 text-sm leading-snug">
        {site.reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
      {site.details && <SiteDetailsBlock d={site.details} />}
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        <span className="font-semibold text-foreground">Not checked:</span> {site.notChecked} Looked in {site.region}. Yield from the Global Solar Atlas (World Bank, data by Solargis).
      </p>
    </Card>
  );
}

/** The colour chart marks are drawn in: the marigold's hue, deep enough for a thin bar or a line to read on paper. */
const CHART = 'hsl(var(--chart))';

/** A figure with its label, for the top of a chart. */
function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <p className="label-caps">{label}</p>
      <p className="display mt-0.5 text-2xl">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

/**
 * This week on the roof: what the system would make on each of the next seven days, from the
 * weather forecast. One bar a day, all one colour. Tomorrow and the best day carry their
 * figure; the rest give theirs on hover, on focus, and in the table underneath.
 */
function WeekCard({ week, kw, designed, tariff }: { week: SunWeek; kw: number; designed: boolean; tariff?: number }) {
  const [on, setOn] = useState<number | null>(null);
  const made = (sunHours: number) => Math.round(kw * dailyYieldPerKw(sunHours) * 10) / 10;
  const units = week.days.map((d) => made(d.sunHours));
  const usual = week.usualSunHours ? made(week.usualSunHours) : undefined;
  const top = Math.max(...units, usual ?? 0, 0.1) * 1.22;
  const tomorrow = Math.min(1, week.days.length - 1);
  // The best day still to come: by the time anyone looks, much of today has often gone.
  const ahead = units.slice(1);
  const best = ahead.length ? 1 + ahead.indexOf(Math.max(...ahead)) : 0;
  const day = (date: string, how: 'short' | 'long') => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', how === 'short' ? { weekday: 'short', timeZone: 'UTC' } : { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).replace(',', '');
  const total = Math.round(units.reduce((a, b) => a + b, 0));
  const shown = on ?? tomorrow;
  // With no system designed the figures are for one kilowatt, and every one of them says so.
  const unit = designed ? 'units' : 'units per kW';
  const about = (i: number) => `${day(week.days[i].date, 'long')}: ${units[i]} ${unit}, ${week.days[i].sky}${week.days[i].rainChance !== undefined ? `, ${Math.round(week.days[i].rainChance!)}% chance of rain` : ''}`;
  return (
    <Card title="This week on your roof" right={<Chip tone="sun">{week.place}</Chip>}>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Tomorrow" value={`${units[tomorrow]} ${unit}`} sub={`${day(week.days[tomorrow].date, 'long')} · ${week.days[tomorrow].sky}`} />
        <Stat label="Best day ahead" value={`${units[best]} ${unit}`} sub={`${day(week.days[best].date, 'long')} · ${week.days[best].sky}`} />
        <Stat label="Seven days" value={`${total} ${unit}`} sub={designed && tariff ? `worth about ${inr(Math.round(total * tariff))}` : undefined} />
      </div>

      <div className="relative mt-4 flex h-36 items-end border-b border-foreground/25" role="group" aria-label={`Units made on each of the next ${week.days.length} days. The best day ahead: ${about(best)}.`}>
        {usual !== undefined && (
          <div className="pointer-events-none absolute inset-x-0 border-t border-foreground/25" style={{ bottom: `${(usual / top) * 100}%` }}>
            <span className="absolute right-0 -top-4 bg-[hsl(var(--card))] pl-1 text-[10px] font-semibold text-muted-foreground">a usual day: {usual}</span>
          </div>
        )}
        {week.days.map((d, i) => (
          <div
            key={d.date}
            tabIndex={0}
            role="img"
            aria-label={about(i)}
            onPointerEnter={() => setOn(i)}
            onPointerLeave={() => setOn(null)}
            onFocus={() => setOn(i)}
            onBlur={() => setOn(null)}
            className="relative flex h-full flex-1 cursor-default items-end justify-center outline-none focus-visible:bg-foreground/5"
          >
            <div className="relative w-6 max-w-[70%] rounded-t-[4px]" style={{ height: `${Math.max(1, (units[i] / top) * 100)}%`, background: CHART, opacity: on === i ? 0.78 : 1 }}>
              {(i === tomorrow || i === best || on === i) && <span className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-bold text-foreground">{units[i]}</span>}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1 flex text-center text-[11px] text-muted-foreground" aria-hidden="true">
        {week.days.map((d, i) => (
          <span key={d.date} className={`flex-1 ${i === tomorrow ? 'font-bold text-foreground' : 'font-semibold'}`}>
            {i === 0 ? 'Today' : day(d.date, 'short')}
          </span>
        ))}
      </div>
      <p className="mt-2 min-h-[1.25rem] text-sm font-semibold">{about(shown)}</p>

      <details className="mt-1 text-xs text-muted-foreground">
        <summary className="cursor-pointer font-semibold">See the seven days as a table</summary>
        <table className="mt-1 w-full text-left tabular-nums">
          <thead>
            <tr>
              <th className="py-0.5 pr-2 font-semibold">Day</th>
              <th className="py-0.5 pr-2 font-semibold">Units</th>
              <th className="py-0.5 pr-2 font-semibold">Sun hours</th>
              <th className="py-0.5 font-semibold">Sky</th>
            </tr>
          </thead>
          <tbody>
            {week.days.map((d, i) => (
              <tr key={d.date} className="border-t border-foreground/10">
                <td className="py-0.5 pr-2">{day(d.date, 'long')}</td>
                <td className="py-0.5 pr-2">{units[i]}</td>
                <td className="py-0.5 pr-2">{d.sunHours}</td>
                <td className="py-0.5">{d.sky}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        {designed ? `Worked out for the ${kw} kW system, with the same sum as the design.` : 'No system is designed yet, so this is for one kilowatt of panels.'} The weather forecast is from Open-Meteo, fetched at{' '}
        {new Date(week.fetchedAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}. A forecast changes, and it cannot see the shade on one roof.
      </p>
    </Card>
  );
}

/**
 * The roof at this moment: what the system is making now, today hour by hour as one line with
 * the present marked on it, and which household things that much power carries. Every hour
 * gives its figure under the pointer, on the arrow keys and in the table.
 */
function NowCard({ now, kw, designed }: { now: RoofNow; kw: number; designed: boolean }) {
  const [at, setAt] = useState<number | null>(null);
  const power = (watts: number) => powerFrom(kw, watts);
  const up = now.isDay && now.sunNow > 0;
  const nowKw = up ? power(now.sunNow) : 0;
  const peak = bestHour(now.hours);
  // The reading for this moment can stand a little above the best hour's average: the best is then now.
  const peakKw = Math.max(power(peak.watts), nowKw);
  const hourOf = (clock: string | undefined, otherwise: number) => (clock && /^\d\d:\d\d$/.test(clock) ? Number(clock.slice(0, 2)) + Number(clock.slice(3)) / 60 : otherwise);
  const hourNow = Number(now.at.slice(11, 13)) + Number(now.at.slice(14, 16)) / 60;
  // The picture runs from the hour before sunrise to the hour after sunset.
  const from = Math.max(0, Math.floor(hourOf(now.sunrise, 6)) - 1);
  const to = Math.min(24, Math.ceil(hourOf(now.sunset, 18)) + 1);
  const W = 440;
  const H = 188;
  const m = { l: 34, r: 14, t: 24, b: 22 };
  const hi = Math.max(peakKw, nowKw, 0.1) * 1.18;
  const step = hi > 4 ? 2 : hi > 2 ? 1 : hi > 1 ? 0.5 : hi > 0.5 ? 0.25 : 0.1;
  const ticks: number[] = [];
  for (let v = 0; v <= hi; v += step) ticks.push(Math.round(v * 100) / 100);
  const x = (hour: number) => m.l + ((hour - from) / (to - from)) * (W - m.l - m.r);
  const y = (kilowatts: number) => m.t + (1 - kilowatts / hi) * (H - m.t - m.b);
  // Each figure is the average over the hour that ends at its index, so it is drawn at the middle of that hour.
  const points: [number, number][] = [[from, 0]];
  for (let hour = from + 1; hour <= to; hour++) points.push([hour - 0.5, power(now.hours[hour] ?? 0)]);
  points.push([to, 0]);
  const line = points.map(([hour, v], i) => `${i ? 'L' : 'M'}${x(hour).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const time = clockSaid(Math.floor(hourNow), Math.round((hourNow % 1) * 60));
  const figure = (v: number) => `${v >= 1 ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100} kW`;
  const covered = usualCovered(nowKw);
  const asked = now.asked?.length ? askedCovered(nowKw, now.asked) : undefined;
  const askedAtBest = now.asked?.length ? askedCovered(peakKw, now.asked) : undefined;
  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const across = ((e.clientX - box.left) / box.width) * W;
    setAt(Math.max(from + 1, Math.min(to, Math.ceil(from + ((across - m.l) / (W - m.l - m.r)) * (to - from)))));
  };
  const key = (e: React.KeyboardEvent<SVGSVGElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    setAt((was) => Math.max(from + 1, Math.min(to, (was ?? Math.max(from + 1, Math.min(to, Math.ceil(hourNow)))) + (e.key === 'ArrowRight' ? 1 : -1))));
  };
  const per = designed ? undefined : 'for one kW of panels';
  return (
    <Card title="Right now on your roof" right={<Chip tone="sun">{now.place}</Chip>}>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Right now" value={up ? figure(nowKw) : 'Sun is down'} sub={per ?? `as of ${time}`} />
        <Stat label="Best hour today" value={figure(peakKw)} sub={`${clockSaid(peak.hour - 1)} to ${clockSaid(peak.hour)}`} />
        <Stat label="Today in all" value={`${unitsFromHours(kw, now.hours)} units`} sub={per} />
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-3 block h-auto w-full touch-none outline-none focus-visible:ring-2 focus-visible:ring-foreground/40"
        role="img"
        tabIndex={0}
        aria-label={`What the system makes through today, hour by hour. The most is about ${figure(peakKw)}, between ${clockSaid(peak.hour - 1)} and ${clockSaid(peak.hour)}. ${up ? `At ${time} it is making about ${figure(nowKw)}.` : 'The sun is down now.'} Use the left and right arrow keys to read an hour.`}
        onPointerMove={move}
        onPointerLeave={() => setAt(null)}
        onKeyDown={key}
        onBlur={() => setAt(null)}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} stroke="hsl(var(--foreground))" strokeOpacity={v === 0 ? 0.45 : 0.1} strokeWidth={1} />
            <text x={m.l - 6} y={y(v) + 3.5} textAnchor="end" fontSize={10.5} fill="hsl(var(--muted-foreground))">
              {v}
            </text>
          </g>
        ))}
        <text x={m.l - 6} y={11} textAnchor="end" fontSize={10.5} fill="hsl(var(--muted-foreground))">
          kW
        </text>
        {[6, 9, 12, 15, 18].filter((hour) => hour >= from && hour <= to).map((hour) => (
          <text key={hour} x={x(hour)} y={H - 6} textAnchor="middle" fontSize={10.5} fill="hsl(var(--muted-foreground))">
            {clockSaid(hour)}
          </text>
        ))}
        <path d={`${line} Z`} fill={CHART} fillOpacity={0.1} />
        <path d={line} fill="none" stroke={CHART} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {up && hourNow >= from && hourNow <= to && (
          <g>
            <line x1={x(hourNow)} x2={x(hourNow)} y1={y(nowKw)} y2={y(0)} stroke={CHART} strokeWidth={1} />
            <circle cx={x(hourNow)} cy={y(nowKw)} r={5} fill={CHART} stroke="hsl(var(--card))" strokeWidth={2} />
            <text x={x(hourNow) + (hourNow > (from + to) / 2 ? -9 : 9)} y={Math.max(12, y(nowKw) - 9)} textAnchor={hourNow > (from + to) / 2 ? 'end' : 'start'} fontSize={11.5} fontWeight={700} fill="hsl(var(--foreground))">
              now: {figure(nowKw)}
            </text>
          </g>
        )}
        {at !== null && (
          <g pointerEvents="none">
            <line x1={x(at - 0.5)} x2={x(at - 0.5)} y1={m.t} y2={H - m.b} stroke="hsl(var(--foreground))" strokeOpacity={0.5} strokeWidth={1} />
            <circle cx={x(at - 0.5)} cy={y(power(now.hours[at] ?? 0))} r={4.5} fill="hsl(var(--foreground))" stroke="hsl(var(--card))" strokeWidth={2} />
          </g>
        )}
      </svg>
      <p className="mt-1 min-h-[1.25rem] text-sm font-semibold">
        {at !== null
          ? `Between ${clockSaid(at - 1)} and ${clockSaid(at)}: about ${figure(power(now.hours[at] ?? 0))}.`
          : up
            ? `At ${time} it is making about ${figure(nowKw)}${designed ? '' : ' for each kW of panels'}.`
            : `The sun is down${now.sunrise ? `: it comes up at about ${clockSaid(Number(now.sunrise.slice(0, 2)), Number(now.sunrise.slice(3)))}` : ''}.`}
      </p>

      {designed && (
        <div className="mt-2">
          <p className="label-caps">The sun is covering, at this moment</p>
          {up && covered.names.length ? (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {covered.names.map((name) => (
                <Chip key={name}>{name.replace(/^the /, '')}</Chip>
              ))}
              <span className="self-center text-xs text-muted-foreground">running together, about {(covered.watts / 1000).toFixed(1).replace(/\.0$/, '')} kW</span>
            </div>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">{up ? 'Less than a fridge draws: it is early, late or cloudy.' : "Nothing: the grid runs the home now, and the day's surplus is set against it."}</p>
          )}
          {asked && askedAtBest && (
            <p className="mt-2 text-sm leading-snug">
              <span className="font-semibold">
                {asked.names.join(' and ')}: about {(asked.watts / 1000).toFixed(1).replace(/\.0$/, '')} kW{asked.names.length > 1 ? ' together' : ''}.
              </span>{' '}
              {asked.names.length > 1 ? 'They run' : 'It runs'} at any hour, because the home stays on the grid. At this moment the sun covers {up ? shareSaid(asked.share) : 'none of it'}; at today&apos;s best hour, {shareSaid(askedAtBest.share)}.
            </p>
          )}
        </div>
      )}

      <details className="mt-2 text-xs text-muted-foreground">
        <summary className="cursor-pointer font-semibold">See the hours as a table</summary>
        <table className="mt-1 w-full text-left tabular-nums">
          <thead>
            <tr>
              <th className="py-0.5 pr-2 font-semibold">Hour</th>
              <th className="py-0.5 font-semibold">Making, about</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: to - from }, (_, i) => from + 1 + i)
              .filter((hour) => (now.hours[hour] ?? 0) > 0)
              .map((hour) => (
                <tr key={hour} className="border-t border-foreground/10">
                  <td className="py-0.5 pr-2">
                    {clockSaid(hour - 1)} to {clockSaid(hour)}
                  </td>
                  <td className="py-0.5">{figure(power(now.hours[hour] ?? 0))}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </details>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        {designed ? `Worked out for the ${kw} kW system, with the same share lost to heat and wiring as the design.` : 'No system is designed yet, so this is for one kilowatt of panels.'} Sunshine is from Open-Meteo, as of {time}. Appliance figures are typical ratings: the label has the real one.
        Everything in the home runs at any hour, because it stays on the grid; the sun decides how much of it is paid for.
      </p>
    </Card>
  );
}

/** A step for an axis that lands on clean numbers: 1, 2, 2.5 or 5 times a power of ten. */
function cleanStep(span: number, about = 4): number {
  const rough = span / about;
  const power = Math.pow(10, Math.floor(Math.log10(Math.max(rough, 1))));
  return [1, 2, 2.5, 5, 10].map((m) => m * power).find((step) => step >= rough) ?? 10 * power;
}

/**
 * Twenty-five years at a glance: how far behind or ahead the household is at the end of each
 * year, as one line through nought. The year it crosses nought and the end carry their
 * figures; any other year gives its own under the pointer, on the arrow keys, and in the table.
 */
function LongRunCard({ d, rise }: { d: Design; rise: number }) {
  const [at, setAt] = useState<number | null>(null);
  const run = longRun(d.netCost, d.monthlySavings, rise);
  const years = LONG_RUN.years;
  const W = 440;
  const H = 214;
  const m = { l: 42, r: 14, t: 22, b: 24 };
  const lo = Math.min(0, ...run.position);
  const hi = Math.max(0, ...run.position) * 1.1 || 1;
  const step = cleanStep(hi - lo);
  const ticks: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(Math.round(v));
  const x = (year: number) => m.l + (year / years) * (W - m.l - m.r);
  const y = (rupees: number) => m.t + (1 - (rupees - lo) / (hi - lo)) * (H - m.t - m.b);
  const line = run.position.map((v, year) => `${year ? 'L' : 'M'}${x(year).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const short = (v: number) => (v === 0 ? '0' : Math.abs(v) >= 1e7 ? `${+(v / 1e7).toFixed(1)}Cr` : Math.abs(v) >= 1e5 ? `${+(v / 1e5).toFixed(1)}L` : `${Math.round(v / 1000)}K`);
  const money = (v: number) => `₹${inLakh(Math.abs(v))}`;
  const stands = (year: number) => (run.position[year] >= 0 ? `${money(run.position[year])} ahead` : `${money(run.position[year])} still to earn back`);
  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const across = ((e.clientX - box.left) / box.width) * W;
    setAt(Math.max(0, Math.min(years, Math.round(((across - m.l) / (W - m.l - m.r)) * years))));
  };
  const key = (e: React.KeyboardEvent<SVGSVGElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    setAt((now) => Math.max(0, Math.min(years, (now ?? 0) + (e.key === 'ArrowRight' ? 1 : -1))));
  };
  const back = run.paysBackIn;
  return (
    <Card title="Twenty-five years at a glance" right={<Chip tone={rise ? 'sun' : 'plain'}>{rise ? `Electricity ${rise}% dearer a year` : "At today's price of electricity"}</Chip>}>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Pays for itself in" value={back === null ? 'Over 25 years' : `${back} years`} sub={`you pay ${inr(d.netCost)}`} />
        <Stat label="Saved in 25 years" value={money(run.savedInAll)} sub="before the cost" />
        <Stat label="Ahead at the end" value={money(run.aheadAtEnd)} sub="the cost taken off" />
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-3 block h-auto w-full touch-none outline-none focus-visible:ring-2 focus-visible:ring-foreground/40"
        role="img"
        tabIndex={0}
        aria-label={`Where the household stands at the end of each of ${years} years. ${back === null ? 'It does not pay for itself in that time.' : `It has paid for itself after ${back} years.`} After ${years} years: ${stands(years)}. Use the left and right arrow keys to read a year.`}
        onPointerMove={move}
        onPointerLeave={() => setAt(null)}
        onKeyDown={key}
        onBlur={() => setAt(null)}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} stroke="hsl(var(--foreground))" strokeOpacity={v === 0 ? 0.45 : 0.1} strokeWidth={1} />
            <text x={m.l - 6} y={y(v) + 3.5} textAnchor="end" fontSize={10.5} fill="hsl(var(--muted-foreground))">
              {short(v)}
            </text>
          </g>
        ))}
        {[0, 5, 10, 15, 20, 25].map((year) => (
          <text key={year} x={x(year)} y={H - 7} textAnchor={year === 0 ? 'start' : year === years ? 'end' : 'middle'} fontSize={10.5} fill="hsl(var(--muted-foreground))">
            {year === 0 ? 'bought' : year === years ? `${years} years` : year}
          </text>
        ))}
        <path d={`${line} L${x(years).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`} fill={CHART} fillOpacity={0.1} />
        <path d={line} fill="none" stroke={CHART} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {back !== null && back > 0 && (
          <g>
            <circle cx={x(back)} cy={y(0)} r={5} fill={CHART} stroke="hsl(var(--card))" strokeWidth={2} />
            <text x={x(back) + 9} y={y(0) + 15} fontSize={11.5} fontWeight={700} fill="hsl(var(--foreground))">
              paid for itself: {back} years
            </text>
          </g>
        )}
        <circle cx={x(years)} cy={y(run.aheadAtEnd)} r={5} fill={CHART} stroke="hsl(var(--card))" strokeWidth={2} />
        <text x={x(years) - 9} y={y(run.aheadAtEnd) - 9} textAnchor="end" fontSize={11.5} fontWeight={700} fill="hsl(var(--foreground))">
          {stands(years)}
        </text>
        {at !== null && (
          <g pointerEvents="none">
            <line x1={x(at)} x2={x(at)} y1={m.t} y2={H - m.b} stroke="hsl(var(--foreground))" strokeOpacity={0.5} strokeWidth={1} />
            <circle cx={x(at)} cy={y(run.position[at])} r={4.5} fill="hsl(var(--foreground))" stroke="hsl(var(--card))" strokeWidth={2} />
          </g>
        )}
      </svg>
      <p className="mt-1 min-h-[1.25rem] text-sm font-semibold">
        {at === null ? `After ${years} years: ${stands(years)}.` : at === 0 ? `The day it is bought: ${stands(0)}.` : `After ${at} year${at === 1 ? '' : 's'}: ${stands(at)}. It saves ${inr(run.savedInYear[at - 1])} that year.`}
      </p>

      <details className="mt-1 text-xs text-muted-foreground">
        <summary className="cursor-pointer font-semibold">See the years as a table</summary>
        <table className="mt-1 w-full text-left tabular-nums">
          <thead>
            <tr>
              <th className="py-0.5 pr-2 font-semibold">After</th>
              <th className="py-0.5 pr-2 font-semibold">Saved that year</th>
              <th className="py-0.5 font-semibold">Where you stand</th>
            </tr>
          </thead>
          <tbody>
            {[1, 5, 10, 15, 20, 25].map((year) => (
              <tr key={year} className="border-t border-foreground/10">
                <td className="py-0.5 pr-2">
                  {year} year{year === 1 ? '' : 's'}
                </td>
                <td className="py-0.5 pr-2">{inr(run.savedInYear[year - 1])}</td>
                <td className="py-0.5">{stands(year)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        {rise ? `Electricity is taken as ${rise}% dearer every year, which is the "what if" that was asked for and not a forecast.` : "Electricity is kept at today's price for all 25 years: if it rises, the saving is larger."} Counted: the panels making{' '}
        {LONG_RUN.fadePercentAYear}% less each year, the usual warranty&apos;s floor. Left out: cleaning, a new inverter after ten years or so, and the interest on a loan. So the true figure is somewhat lower.
      </p>
    </Card>
  );
}

/**
 * Registered vendors with their numbers, and a line saying whose list it is: the district's own,
 * or the busiest in the state when the district's was not read. A number is a link, so a tap on
 * a phone rings it.
 */
function VendorRows({ v, forFarm }: { v: VendorsShown; forFarm?: boolean }) {
  // A conversation kept from before lists were read by state has the district under its old name.
  const place = v.place ?? (v as { district?: string }).district ?? 'this area';
  const own = v.scope !== 'state';
  return (
    <>
      <ul className="mt-1 flex flex-col gap-1.5 text-sm">
        {v.list.map((x) => (
          <li key={x.phone} className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="min-w-0 font-semibold">{x.name}</span>
            <span className="shrink-0 tabular-nums">
              <a className="font-bold underline decoration-2 underline-offset-2" href={`tel:+91${x.phone}`}>
                {x.phone.replace(/(\d{5})(\d{5})/, '$1 $2')}
              </a>
              <span className="text-muted-foreground">
                {' '}
                · {x.ratings > 0 ? `${x.rating} of 5 (${x.ratings.toLocaleString('en-IN')})` : 'not yet rated'} · {x.installs.toLocaleString('en-IN')} installed
              </span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-xs text-muted-foreground">
        {own
          ? `Registered vendors for ${place} with the most installations there`
          : `The registered vendors with the most installations in ${place} as a whole${v.district ? `, not picked for being near ${v.district}` : ''}`}
        , from the national rooftop solar portal (pmsuryaghar.gov.in), read on {v.readOn}. {own ? '' : 'Ask each whether they work in your district. '}
        {forFarm ? 'They are rooftop vendors: ask each about a ground plant of this size.' : 'A list, not a recommendation: Dhoop has not checked their work.'}
      </p>
    </>
  );
}

/** Registered vendors asked for by place: "who installs solar in Jaipur?". */
function VendorsCard({ v }: { v: VendorsShown & { askedFor: string } }) {
  return (
    <Card title={`Who installs solar in ${v.askedFor}`} right={<Chip tone="sun">{v.scope === 'state' ? `${v.place}'s busiest` : 'This district'}</Chip>}>
      <VendorRows v={v} />
    </Card>
  );
}

/** The practical side of a solar farm's site, as Dhoop fetched it: the grid, who can build it, and the money. */
function SiteDetailsBlock({ d }: { d: SiteDetails }) {
  const money = (n: number) => (n >= 1e7 ? `₹${Math.round(n / 1e6) / 10} crore` : `₹${Math.round(n / 1e4) / 10} lakh`);
  const subs = d.substations;
  const m = d.money;
  return (
    <div className="mt-4 flex flex-col gap-4 border-t-2 border-dotted border-foreground/30 pt-3">
      <div>
        <div className="flex items-center justify-between gap-2">
          <p className="label-caps">The grid: nearest substations</p>
          {subs && subs.length > 0 && <Chip tone={subs[0].km <= 5 ? 'good' : 'plain'}>{subs[0].km <= 5 ? 'within the 5 km the scheme prefers' : 'further than 5 km'}</Chip>}
        </div>
        {subs === null ? (
          <p className="mt-1 text-sm text-muted-foreground">The map of substations could not be read just now.</p>
        ) : subs.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">None is mapped within 25 km. Small ones are often missing from the map: the electricity company can name the nearest.</p>
        ) : (
          <ul className="mt-1 flex flex-col gap-1 text-sm">
            {subs.map((s) => (
              <li key={`${s.km}-${s.way}`} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0">
                  <span className="font-semibold">{s.name ?? 'Substation, not named on the map'}</span>
                  <span className="text-muted-foreground">
                    {s.kv.length ? ` · ${s.kv.join(' / ')} kV` : ''}
                    {s.operator ? ` · ${s.operator}` : ''}
                  </span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums">
                  {s.km} km {s.way}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1 text-xs text-muted-foreground">Whether a substation has room for the power is for the electricity company to say. From OpenStreetMap, by way of OpenInfraMap; small substations are often missing.</p>
      </div>

      <div>
        <p className="label-caps">Who can build it</p>
        {d.vendors ? (
          <VendorRows v={d.vendors} forFarm />
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">
            Which state this is in could not be told, so no list was picked. The official list is on pmsuryaghar.gov.in under &ldquo;Registered vendors&rdquo;, by state and district.
          </p>
        )}
      </div>

      <div>
        <p className="label-caps">The money</p>
        <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile label="Paid a unit" value={m.perUnitRange ? `₹${m.perUnitRange[0]}–${m.perUnitRange[1]}` : `₹${m.perUnit}`} />
          <Tile label="Earns a year" value={money(m.earnsAYear)} />
          <Tile label="Costs to build" value={`${money(m.cost[0]).replace(' crore', '')}–${money(m.cost[1]).replace('₹', '')}`} sub="land not counted" />
          <Tile label="Pays back in" value={`${m.payback[0]}–${m.payback[1]} yrs`} />
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          The price a unit is {m.perUnitWhat}. The cost is an industry estimate. Running costs, land, loan interest and the slow fall in output are left out, so it takes longer in practice. Check first that PM-KUSUM Component A is still open in the state.
        </p>
      </div>
    </div>
  );
}

/** What every roof around the home could make between them. An upper limit, and it says so. */
function StreetCard({ st }: { st: Street }) {
  const many = (n: number) => (n >= 1e7 ? `${(n / 1e7).toFixed(1)} crore` : n >= 1e5 ? `${(n / 1e5).toFixed(1)} lakh` : Math.round(n).toLocaleString('en-IN'));
  return (
    <Card title="If the whole neighbourhood went solar" right={<Chip tone="sun">{st.roofs.toLocaleString('en-IN')} roofs</Chip>}>
      <div className="grid grid-cols-2 gap-3">
        <Tile label="Power, every roof filled" value={st.kw >= 1000 ? `${(st.kw / 1000).toFixed(2)} MW` : `${Math.round(st.kw)} kW`} sub={`${st.panels.toLocaleString('en-IN')} panels`} />
        <Tile label="Electricity a year" value={`${many(st.unitsAYear)} units`} sub={st.homesLikeThis ? `what ${st.homesLikeThis.toLocaleString('en-IN')} homes like yours use` : undefined} />
        <Tile label="Worth a year" value={`₹${many(st.rupeesAYear)}`} sub={`at ₹${st.tariff} a unit`} />
        <Tile label="Carbon dioxide kept out" value={`${st.co2TonnesAYear.toLocaleString('en-IN')} tonnes`} sub="a year" />
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        Every roof within {st.radiusM} m of the home, filled as far as it goes. An upper limit, not a forecast: real roofs have tanks, stairs and shade, and not every owner will agree.
      </p>
    </Card>
  );
}

/** The year, month by month: what the system makes against what the home uses. The monsoon shows as the dip. */
function YearStrip({ kw, monthly, used }: { kw: number; monthly: number[]; used: number }) {
  const year = throughTheYear(kw, monthly, used);
  if (!year) return null;
  const top = Math.max(...year.months.map((m) => m.made), used) * 1.1;
  return (
    <div className="mt-3 rounded-md border-2 border-foreground/25 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="label-caps">The year, month by month</p>
        <p className="text-[11px] text-muted-foreground">bars: units made{used > 0 ? ' · line: units you use' : ''}</p>
      </div>
      <div className="relative mt-2 flex h-24 items-end gap-1" role="img" aria-label={`Units made in each month. Most in ${year.best.name}, about ${year.best.made}. Least in ${year.poorest.name}, about ${year.poorest.made}.`}>
        {used > 0 && <div className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-foreground/70" style={{ bottom: `${(used / top) * 100}%` }} />}
        {year.months.map((m) => (
          <div key={m.name} className="flex h-full flex-1 flex-col justify-end" title={`${m.name}: ${m.made} units`}>
            <div className={`w-full rounded-t-[2px] border-2 border-b-0 border-foreground ${used > 0 && m.made < used ? 'bg-primary/40' : 'bg-primary'}`} style={{ height: `${(m.made / top) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1 text-center text-[10px] font-bold text-muted-foreground" aria-hidden="true">
        {year.months.map((m) => (
          <span key={m.name} className="flex-1">
            {m.name[0]}
          </span>
        ))}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        Most in {year.best.name} ({year.best.made.toLocaleString('en-IN')} units), least in {year.poorest.name} ({year.poorest.made.toLocaleString('en-IN')}).{' '}
        {used > 0 ? (year.monthsShort ? `In ${year.monthsShort} month${year.monthsShort === 1 ? '' : 's'} it makes less than you use; net metering sets the sunny months against them.` : 'It makes at least what you use in every month.') : ''}
      </p>
    </div>
  );
}

function DesignCard({ d, session }: { d: Design; session: Session }) {
  return (
    <Card title="Your solar system" right={<Chip tone="sun">Scheme closes in {daysLeft()} days</Chip>}>
      <div className="grid grid-cols-2 gap-2">
        <Tile label="System" value={`${d.kw} kW`} sub={`${d.panels} panels${d.limitedByRoof ? ', limited by the roof' : ''}`} />
        <Tile label="Government subsidy" value={inr(d.subsidy)} sub="PM Surya Ghar" />
        <Tile label="Monthly bill" value={`${inr(d.billBefore)} → ${inr(d.billAfter)}`} sub={`Saves ${inr(d.monthlySavings)} a month`} />
        <Tile label="Pays back in" value={`${d.paybackYears} years`} sub={`${inr(d.netCost)} after subsidy`} />
      </div>
      {session.loan && session.loan.cost === d.grossCost && (
        <div className="mt-2 rounded-md border border-border p-3">
          <p className="text-sm font-medium">
            With the scheme&apos;s bank loan: {inr(session.loan.instalment)} a month for {session.loan.years} years, against {inr(session.loan.saving)} saved a month
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            You pay {inr(session.loan.own)} first and borrow {inr(session.loan.amount)} at {LOAN.ratePercentAYear}% a year. With the subsidy paid into the loan it falls to {inr(session.loan.instalmentAfterSubsidy)} a month. The rate can
            change and the bank decides. Terms read on the portal, {LOAN.readOn}.
          </p>
        </div>
      )}
      <YearStrip kw={d.kw} monthly={session.location?.monthly ?? []} used={session.bill?.monthlyUnits ?? 0} />
      <div className="mt-3 flex flex-wrap gap-2">
        <Chip>{d.sunHours} sun hours a day{session.location ? ` in ${session.location.label}` : ''}</Chip>
        <Chip>Makes {d.monthlyGeneration.toLocaleString('en-IN')} units a month</Chip>
        <Chip>Covers {Math.round(d.coverage * 100)}% of use</Chip>
        <Chip>{d.co2TonnesPerYear} t CO₂ less a year</Chip>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Estimates. {d.notes.join(' ')}
      </p>
    </Card>
  );
}

function CompareCard({ a, b }: { a: Design; b: Design }) {
  const rows: [string, (d: Design) => string][] = [
    ['Panels', (d) => String(d.panels)],
    ['Subsidy', (d) => inr(d.subsidy)],
    ['Price after subsidy', (d) => inr(d.netCost)],
    ['Bill after solar', (d) => inr(d.billAfter)],
    ['Saves a month', (d) => inr(d.monthlySavings)],
    ['Pays back in', (d) => `${d.paybackYears} years`],
  ];
  return (
    <Card title="Two sizes, side by side">
      <table className="w-full table-fixed text-sm">
        <thead>
          <tr className="text-left">
            <th className="w-2/5 py-1 font-normal text-muted-foreground" scope="col">
              &nbsp;
            </th>
            <th className="py-1 text-xl font-semibold" scope="col">
              {a.kw} kW
            </th>
            <th className="py-1 text-xl font-semibold" scope="col">
              {b.kw} kW
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, f]) => (
            <tr key={label} className="border-t border-border">
              <th className="py-1.5 text-left font-normal text-muted-foreground" scope="row">
                {label}
              </th>
              <td className="py-1.5 font-medium">{f(a)}</td>
              <td className="py-1.5 font-medium">{f(b)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

/**
 * Where the household stands with its subsidy application: what it was asked, the ten stages
 * of the portal with the done ones ticked and the next one spelt out, and what to keep ready.
 */
function ApplicationCard({ session }: { session: Session }) {
  const done = Math.min(session.application?.stagesDone ?? 0, SUBSIDY_STEPS.length);
  const asked = session.application?.eligibility;
  const fixes = asked ? eligibilityVerdict(asked).fixes : [];
  const finished = done >= SUBSIDY_STEPS.length;
  return (
    <Card title="Your subsidy application" right={<Chip tone={finished ? 'good' : 'sun'}>{finished ? 'Subsidy paid' : `Stage ${done + 1} of ${SUBSIDY_STEPS.length}`}</Chip>}>
      {asked && (
        <div className="mb-3">
          <div className="flex flex-wrap gap-1.5">
            {ELIGIBILITY_CHECKS.map((c) => (
              <Chip key={c.key} tone={asked[c.key] === 'yes' ? 'good' : asked[c.key] === 'no' ? 'sun' : 'plain'}>
                {asked[c.key] === 'yes' ? '✓' : asked[c.key] === 'no' ? '!' : '?'} {c.good}
              </Chip>
            ))}
          </div>
          {fixes.map((fix) => (
            <p key={fix} className="mt-2 rounded-md bg-amber-100 px-3 py-2 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100">
              <span className="font-semibold">Put right first.</span> {fix}
            </p>
          ))}
        </div>
      )}
      <ol className="flex flex-col gap-1">
        {SUBSIDY_STEPS.map((step, i) => {
          const state = i < done ? 'done' : i === done ? 'next' : 'later';
          return (
            <li key={step.title} className={`flex gap-3 rounded-md px-2 py-1.5 ${state === 'next' ? 'bg-amber-400/15 ring-1 ring-amber-400/60' : ''}`}>
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  state === 'done' ? 'bg-emerald-500 text-white' : state === 'next' ? 'bg-amber-400 text-amber-950' : 'bg-muted text-muted-foreground'
                }`}
              >
                {state === 'done' ? '✓' : i + 1}
              </span>
              <span className="text-sm">
                <span className={`font-medium ${state === 'later' ? 'text-muted-foreground' : ''}`}>{step.title}</span>
                {state === 'next' && (
                  <span className="text-muted-foreground">
                    . {step.detail} <span className="font-medium text-foreground">{step.who === 'you' ? 'Your turn.' : `The ${step.who} acts.`}</span>
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="mt-3 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">Keep ready</p>
        <ul className="mt-1 list-disc pl-4">
          {KEEP_READY.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="mt-2">{FRAUD_WARNING}</p>
        <p className="mt-2">
          Source: <a className="underline" href={SUBSIDY.source} target="_blank" rel="noopener noreferrer">pmsuryaghar.gov.in</a>, read 20 Nov 2026. Helpline {HELPLINE}, toll free. You apply on the portal yourself: confirm each stage
          there before you act.
        </p>
      </div>
    </Card>
  );
}

function QuotesCard({ session }: { session: Session }) {
  const quotes = [...session.quotes].sort((p, q) => p.price - q.price);
  return (
    <Card title="Installer quotes" right={session.booking ? <Chip tone="good">Site visit booked</Chip> : <Chip>Survey sent for {session.survey?.homeowner}</Chip>}>
      {quotes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Waiting for installers to reply. Dhoop will speak up when a quote arrives.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {quotes.map((q, i) => (
            <li key={q.id} className="flex items-center justify-between gap-3 rounded-md bg-muted p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{q.installer}</p>
                <p className="text-xs text-muted-foreground">
                  Installs in {q.days} days{q.note ? `. ${q.note}` : ''}
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg font-semibold">{inr(q.price)}</p>
                {i === 0 && quotes.length > 1 && <Chip tone="good">Lowest</Chip>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {session.booking && (
        <p className="mt-3 text-sm">
          Site visit with <span className="font-medium">{session.booking.installer}</span> on <span className="font-medium">{session.booking.day}</span> at <span className="font-medium">{session.booking.time}</span>. A reminder comes the day before.
        </p>
      )}
    </Card>
  );
}

function RoofSummary({ session }: { session: Session }) {
  const r = session.roof!;
  return (
    <div className="flex flex-wrap gap-2">
      <Chip tone="good">{r.source === 'model' ? 'Measured on the model' : r.source === 'satellite' ? 'Marked from space' : r.source === 'found' ? 'Found by Dhoop from space' : 'Told by voice'}</Chip>
      <Chip>{Math.round(r.areaM2 * SQFT_PER_M2).toLocaleString('en-IN')} sq ft</Chip>
      <Chip>{Math.round(r.shadeFraction * 100)}% in shade</Chip>
      <Chip>Room for {r.panelsFit} panels ({r.capacityKw} kW)</Chip>
    </div>
  );
}

function Feed({ session }: { session: Session | null }) {
  const lines = [...(session?.log ?? [])].reverse().slice(0, 7);
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h2 className="mb-2 text-base font-semibold">What Dhoop has done</h2>
      {lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">Each action Dhoop takes is listed here as it happens.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {lines.map((l, i) => (
            <li key={`${l.t}-${i}`} className="flex items-baseline gap-2 text-sm">
              <span className="shrink-0 font-mono text-xs text-muted-foreground">{new Date(l.t).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
              <span>{l.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
