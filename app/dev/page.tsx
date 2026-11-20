'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Stage from '@/components/dhoop/Stage';

/**
 * Test the whole flow without voice. Each button calls one of the agent's tools exactly as
 * Agora would, so the big screen can be checked before any keys are in place.
 * Only available in development, or when DHOOP_DEV_TOOLS=1.
 */

const STEPS: { label: string; tool: string; args: Record<string, unknown> }[] = [
  { label: '1. Save bill (310 units, ₹3,200)', tool: 'saveBill', args: { monthly_units: 310, bill_amount: 3200, source: 'spoken' } },
  { label: '2. Set location (Bengaluru)', tool: 'setLocation', args: { place: 'Bengaluru' } },
  { label: '2b. Find a building by name (Vidhana Soudha)', tool: 'findBuilding', args: { place: 'Vidhana Soudha, Bengaluru' } },
  { label: '2c. Add 300 sq m on the right', tool: 'changeRoof', args: { change: 'add', side: 'right', amount: 300, unit: 'square_metres' } },
  { label: '2d. Leave out a quarter on the left', tool: 'changeRoof', args: { change: 'remove', side: 'left', amount: 25, unit: 'percent' } },
  { label: '2h. Move the outline 4 m up', tool: 'moveRoof', args: { direction: 'top', distance: 4, unit: 'metres' } },
  { label: '2e. Next building to the right', tool: 'nextBuilding', args: { direction: 'right' } },
  { label: '2f. Undo the last roof change', tool: 'undoRoofChange', args: { reason: 'test' } },
  { label: '2g. The whole neighbourhood (200 m)', tool: 'showNeighbourhood', args: { radius_metres: 200 } },
  { label: '2i. Best place for a 1 MW farm (Kasaragod district)', tool: 'findSolarSite', args: { capacity_mw: 1, search_in: 'Kasaragod district' } },
  { label: '2j. Which is better: Kochi, Jaipur or Bengaluru', tool: 'comparePlaces', args: { places: 'Kochi; Jaipur; Bengaluru' } },
  { label: '2k. Play the solar story', tool: 'playSolarStory', args: { reason: 'test' } },
  { label: '2l. Registered vendors in Jaipur', tool: 'findVendors', args: { place: 'Jaipur' } },
  { label: '2m. Registered vendors here', tool: 'findVendors', args: { place: 'here' } },
  { label: '3. Read the roof survey', tool: 'getRoofSurvey', args: { reason: 'test' } },
  { label: '3b. Roof by voice (650 sq ft, 20% shade)', tool: 'setRoofManual', args: { area_sqft: 650, shade_percent: 20 } },
  { label: '4. Design the system', tool: 'designSolar', args: { target_kw: 0 } },
  { label: "4b. Twenty-five years (today's price)", tool: 'longRunSavings', args: { price_rise_percent: 0 } },
  { label: '4c. Twenty-five years (5% dearer a year)', tool: 'longRunSavings', args: { price_rise_percent: 5 } },
  { label: '4d. This week on the roof', tool: 'sunForecast', args: { about: 'the week' } },
  { label: '4e. Right now on the roof', tool: 'powerNow', args: { appliances: 'none' } },
  { label: '4f. Can it run the AC and the geyser?', tool: 'powerNow', args: { appliances: 'AC, geyser' } },
  { label: '5. Compare 2 kW and 3 kW', tool: 'compareSizes', args: { kw_a: 2, kw_b: 3 } },
  { label: '6. Show the application', tool: 'subsidySteps', args: { last_stage_done: -1 } },
  { label: '6a. Check eligibility (bank name differs)', tool: 'checkEligibility', args: { is_a_home: 'yes', connection_in_own_name: 'yes', bank_account_same_name: 'no', roof_is_theirs_to_use: 'yes' } },
  { label: '6b. Stage 3 done (approval)', tool: 'subsidySteps', args: { last_stage_done: 3 } },
  { label: '6c. Loan the saving pays for', tool: 'loanPlan', args: { years: 0 } },
  { label: '7. Send survey to installers', tool: 'requestQuotes', args: { homeowner_name: 'Asha' } },
  { label: '8. Read quotes', tool: 'getQuotes', args: { reason: 'test' } },
  { label: '9. Book the site visit', tool: 'bookVisit', args: { installer: 'Sunrise Solar', day: 'Saturday', time: '10 am' } },
];

export default function DevPage() {
  const [sid, setSid] = useState<string | null>(null);
  const [last, setLast] = useState<string>('');

  useEffect(() => {
    let id = window.localStorage.getItem('dhoop-dev-sid');
    if (!id) {
      id = `dev-${Math.random().toString(36).slice(2, 8)}`;
      window.localStorage.setItem('dhoop-dev-sid', id);
    }
    setSid(id);
  }, []);

  const call = async (tool: string, args: Record<string, unknown>) => {
    if (!sid) return;
    const res = await fetch(`/api/tools/${tool}?sid=${encodeURIComponent(sid)}&dev=1`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
    const data = await res.json().catch(() => ({ error: 'No JSON came back.' }));
    setLast(`${tool} → ${JSON.stringify(data, null, 1)}`);
  };

  const reset = async () => {
    if (!sid) return;
    await fetch(`/api/session/${encodeURIComponent(sid)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'reset' }) });
    setLast('Session cleared.');
  };

  const sampleQuote = async () => {
    if (!sid) return;
    const res = await fetch('/api/installer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sid, installer: 'Sunrise Solar', price: 152000, days: 9, note: 'Test quote' }) });
    setLast(`quote → ${JSON.stringify(await res.json().catch(() => ({})))}`);
  };

  return (
    <main className="min-h-dvh bg-background p-4 text-foreground md:p-6">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Test without voice</h1>
          <p className="text-sm text-muted-foreground">Each button runs one tool the way the agent would. Session: {sid ?? '…'}</p>
        </div>
        <Link href="/" className="text-sm text-muted-foreground underline underline-offset-2">
          Back to Dhoop
        </Link>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {STEPS.map((s) => (
          <button key={s.label} type="button" onClick={() => void call(s.tool, s.args)} className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent">
            {s.label}
          </button>
        ))}
        <button type="button" onClick={() => void sampleQuote()} className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent">
          Add a test quote
        </button>
        <button type="button" onClick={() => void reset()} className="rounded-md border border-destructive px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive hover:text-destructive-foreground">
          Clear session
        </button>
      </div>
      {last && <pre className="mb-4 max-h-40 overflow-auto rounded-md bg-muted p-3 text-xs">{last}</pre>}
      {sid && <Stage sid={sid} cameraTrack={null} flags={{}} />}
    </main>
  );
}
