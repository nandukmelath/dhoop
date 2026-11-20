import type { Metadata } from 'next';
import { headers } from 'next/headers';
import QRCode from 'qrcode';
import { PassbookActions } from '@/components/dhoop/PassbookActions';
import { RoofDrawing } from '@/components/dhoop/RoofDrawing';
import { SunMark } from '@/components/dhoop/SunMark';
import { isLang, LANG_ORDER, LANGS, SQFT_PER_M2, SUBSIDY, type Lang } from '@/lib/dhoop/config';
import { PASSBOOK, voiceNote } from '@/lib/dhoop/passbook';
import { publicBaseUrl } from '@/lib/dhoop/server';
import { inr } from '@/lib/dhoop/solar';
import { HELPLINE, SUBSIDY_STEPS } from '@/lib/dhoop/steps';
import { getSession } from '@/lib/dhoop/store';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Solar passbook · Dhoop', robots: { index: false } };

/**
 * The solar passbook: one page a household takes home, on their own phone and in their own
 * language. See lib/dhoop/passbook.ts for why it exists. It is drawn on the server from the
 * session, so it shows what the conversation has reached at the moment it is opened.
 */
export default async function PassbookPage({ params, searchParams }: { params: Promise<{ sid: string }>; searchParams: Promise<{ lang?: string }> }) {
  const { sid } = await params;
  const s = /^[A-Za-z0-9_-]{1,64}$/.test(sid) ? getSession(sid) : undefined;
  // The conversation's language, unless the reader picks another: the one who decides at home
  // may not speak the language the call was in.
  const asked = (await searchParams).lang;
  const own: Lang = s && isLang(s.lang) ? s.lang : 'en';
  const lang: Lang = isLang(asked) ? asked : own;
  const w = PASSBOOK[lang];
  const d = s?.design;
  const r = s?.roof;
  const loan = s?.loan && d && s.loan.cost === d.grossCost ? s.loan : undefined;
  const done = s?.application ? Math.min(s.application.stagesDone, SUBSIDY_STEPS.length) : null;

  // The address of this page, for the code at the foot and for sharing. The public address when there is one.
  const h = await headers();
  const here = `${publicBaseUrl() ?? `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('x-forwarded-host') ?? h.get('host')}`}/plan/${sid}${lang === own ? '' : `?lang=${lang}`}`;
  const code = await QRCode.toDataURL(here, { margin: 1, width: 240, color: { dark: '#1f1a14', light: '#fdf9ee' } }).catch(() => null);

  const entries: [string, string][] = [];
  if (r) entries.push([w.roof, `${Math.round(r.areaM2 * SQFT_PER_M2).toLocaleString('en-IN')} sq ft`], [w.panelsFit, String(r.panelsFit)]);
  if (d) {
    entries.push(
      [w.system, `${d.kw} kW · ${d.panels} ${w.panels}`],
      [w.billNow, `${inr(d.billBefore)} / ${w.aMonth}`],
      [w.billAfter, `${inr(d.billAfter)} / ${w.aMonth}`],
      [w.saving, inr(d.monthlySavings)],
      [w.price, inr(d.grossCost)],
      [w.subsidy, `− ${inr(d.subsidy)}`],
      [w.youPay, inr(d.netCost)],
      [w.payback, `${d.paybackYears} ${w.years}`],
    );
  }
  if (loan) entries.push([w.loan, `${inr(loan.instalment)} / ${w.aMonth}`]);

  return (
    <main className="mx-auto min-h-dvh w-full max-w-md px-4 pb-10 pt-4 text-foreground">
      <nav aria-label="Language" className="mb-3 flex gap-1 overflow-x-auto rounded-md border-2 border-foreground bg-background p-0.5">
        {LANG_ORDER.map((l) => (
          <a key={l} href={`/plan/${sid}?lang=${l}`} aria-current={l === lang ? 'true' : undefined} className={`shrink-0 rounded-[3px] px-2.5 py-1 text-sm font-semibold ${l === lang ? 'bg-primary text-primary-foreground' : 'text-foreground/70'}`}>
            {LANGS[l].native}
          </a>
        ))}
      </nav>
      <article className="slab overflow-hidden">
        <header className="relative overflow-hidden border-b-2 border-foreground bg-primary px-5 pb-5 pt-4">
          <SunMark className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 opacity-90" />
          <p className="display relative text-xl">Dhoop</p>
          <h1 className="display relative mt-6 text-[2.6rem]">{w.title}</h1>
          <p className="relative mt-2 text-sm font-semibold">
            {s?.location?.label ?? w.home}
            {s?.survey?.homeowner ? ` · ${s.survey.homeowner}` : ''}
          </p>
          <p className="relative mt-0.5 text-xs font-medium text-foreground/70">No. {sid.slice(-6).toUpperCase()}</p>
        </header>

        {!r && !d ? (
          <p className="px-5 py-8 text-lg leading-snug">{w.empty}</p>
        ) : (
          <>
            {r?.polygon && r.polygon.length >= 3 && (
              <div className="border-b-2 border-foreground bg-[hsl(var(--night))] px-4 py-4">
                <RoofDrawing ring={r.polygon} panelsFit={r.panelsFit} panelsLit={d?.panels} />
              </div>
            )}

            <dl className="px-5 py-4">
              {entries.map(([label, value]) => (
                <div key={label} className="flex items-baseline gap-2 py-1.5">
                  <dt className="text-[0.95rem] text-foreground/80">{label}</dt>
                  <span className="leader" aria-hidden="true" />
                  <dd className="display text-xl tabular-nums">{value}</dd>
                </div>
              ))}
              <p className="mt-3 text-right">
                <span className="stamp">{w.estimate}</span>
              </p>
            </dl>

            {done !== null && (
              <section className="border-t-2 border-dotted border-foreground/40 px-5 py-4">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="label-caps text-foreground">{w.application}</h2>
                  <p className="display text-lg tabular-nums">
                    {w.stage} {Math.min(done + 1, SUBSIDY_STEPS.length)} / {SUBSIDY_STEPS.length}
                  </p>
                </div>
                <ol className="mt-2 flex gap-1" aria-hidden="true">
                  {SUBSIDY_STEPS.map((step, i) => (
                    <li key={step.title} className={`h-3 flex-1 rounded-[2px] border-2 border-foreground ${i < done ? 'bg-[hsl(var(--leaf))]' : i === done ? 'bg-primary' : 'bg-transparent'}`} />
                  ))}
                </ol>
                {done < SUBSIDY_STEPS.length && (
                  <p className="mt-3 text-[0.95rem] leading-snug">
                    <span className="font-bold">
                      {w.next}: {SUBSIDY_STEPS[done].title}.
                    </span>{' '}
                    {SUBSIDY_STEPS[done].detail}
                  </p>
                )}
                <p className="mt-2 text-sm font-medium text-[hsl(var(--clay))]">{w.warning}</p>
              </section>
            )}
          </>
        )}

        <div className="border-t-2 border-foreground bg-background px-5 py-5">
          <PassbookActions
            sid={sid}
            lang={lang}
            listen={w.listen}
            share={w.share}
            talk={w.talk}
            canListen={!!s && !!voiceNote(s, lang)}
            shareText={`${w.shareLine}${d ? `: ${d.kw} kW, ${inr(d.monthlySavings)} / ${w.aMonth}` : ''}\n${here}`}
          />
        </div>
      </article>

      <footer className="mt-6 flex items-center gap-4">
        {code && (
          // The code is a picture made on the server from this page's own address.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={code} alt="A code that opens this passbook on another phone" width={96} height={96} className="h-24 w-24 shrink-0 rounded-md border-2 border-foreground" />
        )}
        <p className="text-xs leading-relaxed text-muted-foreground">
          Subsidy figures from{' '}
          <a className="underline" href={SUBSIDY.source} target="_blank" rel="noopener noreferrer">
            pmsuryaghar.gov.in
          </a>
          . Helpline {HELPLINE}, toll free. You apply on the portal yourself. Voice by Murf Falcon, conversation on Agora.
        </p>
      </footer>
    </main>
  );
}
