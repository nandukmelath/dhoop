import { NextResponse, type NextRequest } from 'next/server';
import { afterTool, beforeTool, findTool } from '@/lib/dhoop/tools';
import { isTourSession, TOUR } from '@/lib/dhoop/tour';

/**
 * One step of the tour. The visitor says which step; the server knows what the step is.
 * The tools are run exactly as they are when Agora calls them, but with the tour's own fixed
 * arguments, which is why this door needs no secret and the tools' own door still does.
 */

/** Steps run in the last minute, across everyone. Each step may ask a map or weather service a question, and those are shared and free. */
const recent: number[] = [];
const MOST_A_MINUTE = 90;

export async function POST(request: NextRequest, context: { params: Promise<{ sid: string }> }) {
  const { sid } = await context.params;
  if (!isTourSession(sid)) return NextResponse.json({ ok: false, error: 'Not a tour.' }, { status: 400 });
  const body = (await request.json().catch(() => ({}))) as { step?: unknown };
  const index = Number(body.step);
  const step = Number.isInteger(index) ? TOUR[index] : undefined;
  if (!step) return NextResponse.json({ ok: false, error: 'No such step.' }, { status: 400 });

  const now = Date.now();
  while (recent.length && now - recent[0] > 60_000) recent.shift();
  if (recent.length >= MOST_A_MINUTE) return NextResponse.json({ ok: false, error: 'Many people are on the tour just now. Try again in a minute.' }, { status: 429 });
  recent.push(now);

  const tool = findTool(step.tool);
  if (!tool) return NextResponse.json({ ok: false, error: 'The tour is out of step with the tools.' }, { status: 500 });
  try {
    beforeTool(sid, step.tool);
    let result = await tool.run(sid, step.args);
    // An outside service that was slow to wake often answers the second time.
    if (!result.ok && /could not be (reached|fetched)/.test(String(result.error ?? ''))) {
      await new Promise((r) => setTimeout(r, 1200));
      result = await tool.run(sid, step.args);
    }
    if (result.ok) afterTool(sid);
    return NextResponse.json({ ok: !!result.ok, did: result.ok ? step.did(result) : String(result.error ?? 'That step did not work just now.'), last: index === TOUR.length - 1, ...(typeof result.weather_from === 'string' ? { weather_from: result.weather_from } : {}) });
  } catch (error) {
    console.error(`Tour step ${index} failed:`, error);
    return NextResponse.json({ ok: false, did: 'That step did not work just now.', last: index === TOUR.length - 1 });
  }
}
