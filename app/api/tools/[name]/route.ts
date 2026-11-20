import { NextRequest, NextResponse } from 'next/server';
import { scheduleSampleQuotes } from '@/lib/dhoop/quotes';
import { isToolCallAllowed } from '@/lib/dhoop/server';
import { isLocalRequest } from '@/lib/dhoop/local';
import { afterTool, beforeTool, findTool } from '@/lib/dhoop/tools';

/**
 * The agent's tools as HTTP endpoints. Agora's Conversational AI Engine calls these while
 * the person is talking, with the shared secret in the x-dhoop-key header.
 * While developing, the /dev page on this computer may call them without the secret (dev=1).
 * That shortcut is closed to requests arriving through a tunnel, unless DHOOP_DEV_TOOLS=1.
 */
export async function POST(request: NextRequest, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  const url = new URL(request.url);
  const sid = url.searchParams.get('sid') ?? '';
  const devAllowed = process.env.DHOOP_DEV_TOOLS === '1' || (process.env.NODE_ENV !== 'production' && isLocalRequest(request.headers));
  const devCall = url.searchParams.get('dev') === '1' && devAllowed;

  if (!devCall && !isToolCallAllowed(request)) {
    return NextResponse.json({ ok: false, error: 'Not allowed.' }, { status: 401 });
  }
  const tool = findTool(name);
  if (!tool) return NextResponse.json({ ok: false, error: `Unknown tool ${name}.` }, { status: 404 });
  if (!sid) return NextResponse.json({ ok: false, error: 'Missing sid.' }, { status: 400 });

  let args: Record<string, unknown> = {};
  try {
    const parsed = await request.json();
    if (parsed && typeof parsed === 'object') args = parsed as Record<string, unknown>;
  } catch {
    /* a tool with no arguments may arrive with an empty body */
  }

  try {
    beforeTool(sid, name);
    const result = await tool.run(sid, args);
    if (result.ok) afterTool(sid);
    if (name === 'requestQuotes' && result.ok) scheduleSampleQuotes(sid);
    // Always 200: the model reads the JSON and decides what to say, including for errors.
    return NextResponse.json(result);
  } catch (error) {
    console.error(`Tool ${name} failed:`, error);
    return NextResponse.json({ ok: false, error: 'The tool failed. Apologise briefly and try once more.' });
  }
}
