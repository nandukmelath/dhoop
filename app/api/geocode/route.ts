import { NextRequest, NextResponse } from 'next/server';
import { geocode } from '@/lib/dhoop/places';

/**
 * Find a place for the satellite view. Runs on the server so the lookup service sees one polite client.
 * `near=lat,lon` (the home's city, when known) makes nearby matches come first.
 */
export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const q = (params.get('q') ?? '').trim();
  if (q.length < 3) return NextResponse.json({ error: 'Type at least three letters.' }, { status: 400 });
  const [lat, lon] = (params.get('near') ?? '').split(',').map(Number);
  const near = Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : undefined;
  const place = await geocode(q.slice(0, 200), near);
  if (!place) return NextResponse.json({ error: 'Place not found. Try a nearby landmark or the city name.' }, { status: 404 });
  return NextResponse.json(place);
}
