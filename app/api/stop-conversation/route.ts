import { NextResponse } from 'next/server';
import { AgoraClient } from 'agora-agents';
import { saveConversation } from '@/lib/dhoop/memory';
import { agoraArea } from '@/lib/dhoop/server';
import { StopConversationRequest } from '@/types/conversation';

function isAgentAlreadyStoppingOrStopped(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const maybeErr = error as {
    statusCode?: number;
    body?: { detail?: string; reason?: string };
    message?: string;
  };

  const statusCode = maybeErr.statusCode;
  const reason = maybeErr.body?.reason?.toLowerCase();
  const detail = maybeErr.body?.detail?.toLowerCase() ?? maybeErr.message?.toLowerCase() ?? '';

  if (statusCode === 404) return true;
  if (reason === 'invalidrequest' && detail.includes('already in the process of shutting down')) {
    return true;
  }
  return false;
}

export async function POST(request: Request) {
  try {
    const body: StopConversationRequest = await request.json();
    const { agent_id } = body;

    if (!agent_id) {
      return NextResponse.json(
        { error: 'agent_id is required' },
        { status: 400 },
      );
    }

    const appId = process.env.NEXT_PUBLIC_AGORA_APP_ID;
    const appCertificate = process.env.NEXT_AGORA_APP_CERTIFICATE;
    if (!appId || !appCertificate) {
      throw new Error(
        'Missing Agora configuration. Set NEXT_PUBLIC_AGORA_APP_ID and NEXT_AGORA_APP_CERTIFICATE.',
      );
    }

    // Agora forgets a conversation once its agent stops, so copy what was said into the
    // session first (lib/dhoop/memory.ts). A slow answer must not hold up the stop for long.
    await Promise.race([saveConversation(agent_id), new Promise((resolve) => setTimeout(resolve, 5000))]);

    // The same region the agent was started in (AGORA_AREA, see lib/dhoop/server.ts).
    const client = new AgoraClient({
      area: agoraArea(),
      appId,
      appCertificate,
    });
    try {
      await client.stopAgent(agent_id);
    } catch (error) {
      if (isAgentAlreadyStoppingOrStopped(error)) {
        // Treat stop as idempotent: agent is already exiting (or gone).
        return NextResponse.json({ success: true, state: 'already-stopping' });
      }
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error stopping conversation:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to stop conversation',
      },
      { status: 500 },
    );
  }
}
