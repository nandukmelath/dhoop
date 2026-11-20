import { NextResponse } from 'next/server';
import { streetRings } from '@/lib/dhoop/street';

/**
 * The outlines of the roofs in a session's neighbourhood, nearest the home first, for the
 * satellite view to light up. Kept apart from the session itself, which screens read every
 * second: a few hundred outlines are fetched once, when the neighbourhood is first shown.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ sid: string }> }) {
  const { sid } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(sid)) return NextResponse.json({ error: 'Not a session.' }, { status: 400 });
  const street = await streetRings(sid);
  if (!street) return NextResponse.json({ error: 'No neighbourhood has been added up in this session.' }, { status: 404 });
  return NextResponse.json(street, { headers: { 'Cache-Control': 'no-store' } });
}
