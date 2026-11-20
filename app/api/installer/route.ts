import { NextRequest, NextResponse } from 'next/server';
import { SQFT_PER_M2 } from '@/lib/dhoop/config';
import { addQuote } from '@/lib/dhoop/quotes';
import { surveysForInstallers } from '@/lib/dhoop/store';

/** The installers' inbox: surveys waiting for a quote (GET) and sending one back (POST). */

export async function GET() {
  const surveys = surveysForInstallers().map((s) => ({
    sid: s.id,
    surveyId: s.survey!.id,
    homeowner: s.survey!.homeowner,
    sentAt: s.survey!.sentAt,
    place: s.location?.label ?? 'Location not given',
    monthlyUnits: s.bill?.monthlyUnits ?? null,
    roofSqft: s.roof ? Math.round(s.roof.areaM2 * SQFT_PER_M2) : null,
    shadePercent: s.roof ? Math.round(s.roof.shadeFraction * 100) : null,
    roofMeasuredBy: s.roof?.source ?? null,
    kw: s.design?.kw ?? null,
    panels: s.design?.panels ?? null,
    quotes: s.quotes.map((q) => ({ installer: q.installer, price: q.price, days: q.days })),
    booked: s.booking ?? null,
  }));
  return NextResponse.json({ surveys });
}

export async function POST(request: NextRequest) {
  let body: { sid?: string; installer?: string; price?: number; days?: number; note?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Bad JSON.' }, { status: 400 });
  }
  const price = Number(body.price);
  const days = Number(body.days);
  const installer = (body.installer ?? '').trim();
  if (!body.sid || !installer) return NextResponse.json({ error: 'Enter your company name.' }, { status: 400 });
  if (!(price >= 10000 && price <= 5000000)) return NextResponse.json({ error: 'Enter a price between 10,000 and 50,00,000 rupees.' }, { status: 400 });
  if (!(days >= 1 && days <= 180)) return NextResponse.json({ error: 'Enter the number of days to install, 1 to 180.' }, { status: 400 });
  const quote = await addQuote(body.sid, { installer, price, days, note: body.note });
  if (!quote) return NextResponse.json({ error: 'That survey is no longer open.' }, { status: 404 });
  return NextResponse.json({ ok: true, quote });
}
