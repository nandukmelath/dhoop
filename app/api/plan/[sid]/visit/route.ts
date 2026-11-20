import { NextResponse, type NextRequest } from 'next/server';
import { publicBaseUrl } from '@/lib/dhoop/server';
import { getSession } from '@/lib/dhoop/store';
import { visitCalendar } from '@/lib/dhoop/visit';

/**
 * The booked site visit as a calendar file, with a reminder the day before. This is the
 * follow-up that outlasts the call: once the file is in the person's own calendar, the
 * reminder comes whether Dhoop is running or not.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ sid: string }> }) {
  const { sid } = await context.params;
  const booking = /^[A-Za-z0-9_-]{1,64}$/.test(sid) ? getSession(sid)?.booking : undefined;
  if (!booking?.at) return NextResponse.json({ error: 'No visit with a day and time is booked yet.' }, { status: 404 });
  const base = publicBaseUrl() ?? new URL(request.url).origin;
  const file = visitCalendar({ id: booking.id, installer: booking.installer, start: new Date(booking.at), passbookUrl: `${base}/plan/${sid}` });
  return new NextResponse(file, { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'attachment; filename="dhoop-site-visit.ics"', 'Cache-Control': 'no-store' } });
}
