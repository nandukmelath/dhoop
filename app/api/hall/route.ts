import { NextRequest, NextResponse } from 'next/server';
import { CITIES, sunshine } from '@/lib/dhoop/places';
import { designSystem } from '@/lib/dhoop/solar';
import { addHallEntry, hallSummary } from '@/lib/dhoop/store';

/** The hall map: everyone taps in their city and bill, and one shared map fills up. No voice minutes used. */

export async function GET() {
  return NextResponse.json({ ...hallSummary(), cities: CITIES.map((c) => c.label) });
}

export async function POST(request: NextRequest) {
  let body: { city?: string; bill?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Bad JSON.' }, { status: 400 });
  }
  const city = CITIES.find((c) => c.label === body.city);
  const bill = Number(body.bill);
  if (!city) return NextResponse.json({ error: 'Pick a city from the list.' }, { status: 400 });
  if (!(bill >= 100 && bill <= 100000)) return NextResponse.json({ error: 'Enter a monthly bill between 100 and 1,00,000 rupees.' }, { status: 400 });

  const sun = await sunshine(city.lat, city.lon);
  // Only the bill amount is known here, so units are estimated from a typical tariff.
  const design = designSystem({ monthlyUnits: Math.round(bill / 7), billAmount: bill, sunHours: sun.annual });
  // A little scatter so people from one city do not sit on a single dot.
  const jitter = () => (Math.random() - 0.5) * 0.25;
  addHallEntry({ city: city.label, lat: city.lat + jitter(), lon: city.lon + jitter(), kw: design.kw, monthlySavings: design.monthlySavings, subsidy: design.subsidy });
  return NextResponse.json({ ok: true, design, sunHours: sun.annual, sunSource: sun.source, summary: hallSummary() });
}
