import { NextRequest, NextResponse } from 'next/server';
import { ExpiresIn } from 'agora-agents';
import { ClientStartRequest, AgentResponse } from '@/types/conversation';
import { DEFAULT_AGENT_UID } from '@/lib/agora';
import { buildAgent, chooseListening, engineOf, LISTENINGS, noteListeningFailed, type Listening } from '@/lib/dhoop/agent';
import { isLang, type Lang } from '@/lib/dhoop/config';
import { hasMemory, saveConversation } from '@/lib/dhoop/memory';
import { agoraClient, publicBaseUrl, toolSecret } from '@/lib/dhoop/server';
import { ensureSession, updateSession } from '@/lib/dhoop/store';

// agentUid identifies the AI in the RTC channel and shares its default with the client.
const agentUid = String(DEFAULT_AGENT_UID);

/** Starts the Dhoop agent in the caller's channel. The agent's settings live in lib/dhoop/agent.ts. */
export async function POST(request: NextRequest) {
  try {
    const body: ClientStartRequest = await request.json();
    const { requester_id, channel_name } = body;
    if (!channel_name || !requester_id) {
      return NextResponse.json({ error: 'channel_name and requester_id are required' }, { status: 400 });
    }
    const lang: Lang = isLang(body.lang) ? body.lang : 'en';
    const cameraOn = body.camera !== false;
    // The channel name doubles as the session id that tools and screens share.
    const sid = body.sid || channel_name;

    const client = agoraClient();
    const session = ensureSession(sid, lang);
    const returning = !!body.returning;
    // Someone coming back may find the earlier agent still in the channel (a reloaded tab).
    // Save what it heard and make it leave, or the new agent cannot take its seat.
    if (returning && session.agentId) {
      await saveConversation(session.agentId);
      await client.stopAgent(session.agentId).catch(() => {});
    }
    // Carry on only when there is something to carry on from: saved facts or earlier talk.
    const resume = !!body.resume && hasMemory(session);
    updateSession(sid, (s) => {
      s.lang = lang;
    });

    // The screen says so when the recogniser of the agent it had has failed. That recogniser is
    // then left alone for a while, and this agent gets the other one.
    const failed = body.listening_failed ? LISTENINGS.find((l) => l === session.listening) : undefined;
    if (failed) {
      noteListeningFailed(engineOf(failed));
      console.warn(`Speech recognition failed in a call (${failed}). Changing recogniser.`);
    }
    // A test may ask for a listening setup by name. Not in a production build.
    // "ares@40" means the first 40 names only, and "ares@40+20" the 40 after the first 20: for finding a name the recogniser refuses.
    // On the live site one plain name is honoured, "?stt=deepgram": a presenter in a loud hall can
    // move a call off Agora's own recogniser and hear which one copes better. The test switches stay shut there.
    const asked = String(body.stt ?? '');
    const forced: Listening | undefined = process.env.NODE_ENV !== 'production' ? LISTENINGS.find((l) => l === asked.split(/[@!]/)[0]) : asked === 'deepgram' ? 'deepgram-terms' : undefined;

    const { agent, toolsOn, voice, pipeline, listening } = buildAgent({
      client,
      lang,
      sid,
      cameraOn,
      resume,
      returning,
      toolsBase: publicBaseUrl(),
      toolSecret: toolSecret(),
      murfKey: process.env.MURF_API_KEY,
      listening: chooseListening(lang, { failed, forced, plain: !!body.plain_listening }),
      recovering: !!failed,
      // "ares!bad" adds the keyword that stops the recogniser, to test that the app recovers.
      badName: process.env.NODE_ENV !== 'production' && String(body.stt ?? '').includes('!bad') && !body.plain_listening && !failed ? true : undefined,
      endOfSpeech: process.env.NODE_ENV !== 'production' && String(body.stt ?? '').includes('!semantic') ? 'semantic' : process.env.NODE_ENV !== 'production' && String(body.stt ?? '').includes('!vad') ? 'vad' : undefined,
      // "ares!voice" locks onto the voice sampled in public/voiceprint-test.pcm, which the listening test puts there.
      voiceprint: process.env.NODE_ENV !== 'production' && String(body.stt ?? '').includes('!voice') && publicBaseUrl() ? `${publicBaseUrl()}/voiceprint-test.pcm` : undefined,
      // "ares!lock" switches on the speaker lock for this call.
      speakerLock: process.env.NODE_ENV !== 'production' && String(body.stt ?? '').includes('!lock') ? true : undefined,
      nameLimit: process.env.NODE_ENV !== 'production' ? Number(String(body.stt ?? '').split('@')[1]?.split('+')[0]) || undefined : undefined,
      nameSkip: process.env.NODE_ENV !== 'production' ? Number(String(body.stt ?? '').split('+')[1]) || undefined : undefined,
    });

    const agentSession = agent.createSession({
      channel: channel_name,
      agentUid,
      remoteUids: [requester_id],
      // Seconds the agent waits in an empty call before leaving. Call time is counted while it waits.
      idleTimeout: 45,
      expiresIn: ExpiresIn.hours(1),
      debug: process.env.DHOOP_DEBUG === '1',
    });

    const agentId = await agentSession.start();
    updateSession(sid, (s) => {
      s.agentId = agentId;
      s.listening = listening;
    });

    return NextResponse.json({
      agent_id: agentId,
      create_ts: Math.floor(Date.now() / 1000),
      state: 'RUNNING',
      tools_on: toolsOn,
      voice,
      pipeline,
      camera: cameraOn,
      lang,
    } as AgentResponse);
  } catch (error) {
    console.error('Error starting conversation:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to start conversation' },
      { status: 500 },
    );
  }
}
