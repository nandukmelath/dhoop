import { agoraAuth, agoraClient, requireEnv } from './server';
import { getSession, rememberTurns, sessionOfAgent, type Session, type Turn } from './store';

/**
 * Dhoop's memory across agent restarts and calls.
 *
 * Agora keeps a conversation's history only while its agent is running. Dhoop restarts the
 * agent to change language, and a call ends by stopping it. Without this file the next agent
 * would know the saved facts (bill, roof, design) but nothing that was said: it would greet the
 * person again and ask for their name twice. So, before any agent is stopped, its history is
 * copied into the session, and the next agent gets it as part of its instructions.
 */

const MAX_CHARS_PER_TURN = 280;

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  // With the camera on, a turn can arrive as parts: text and pictures. Keep the text.
  if (Array.isArray(content)) {
    return content.map((part) => (typeof part === 'string' ? part : typeof (part as { text?: unknown })?.text === 'string' ? (part as { text: string }).text : '')).join(' ');
  }
  return '';
}

/**
 * Agora's history entries as plain turns. Tool calls and tool results are left out: what they
 * did is already in the session, and the next agent reads it from there.
 */
export function turnsFromHistory(contents: unknown): Turn[] {
  if (!Array.isArray(contents)) return [];
  const turns: Turn[] = [];
  for (const entry of contents) {
    const role = (entry as { role?: unknown } | null)?.role;
    if (role !== 'user' && role !== 'assistant') continue;
    const text = textOf((entry as { content?: unknown }).content).replace(/\s+/g, ' ').trim();
    if (text) turns.push({ role, text: text.slice(0, MAX_CHARS_PER_TURN) });
  }
  return turns;
}

/**
 * Copy what an agent heard and said into its session. Call this before stopping the agent:
 * once it has stopped, Agora answers 404. Returns how many turns the session now remembers.
 */
export async function saveConversation(agentId: string): Promise<number> {
  const session = sessionOfAgent(agentId);
  if (!session) return 0;
  const remembered = () => session.turns?.length ?? 0;
  try {
    const history = await agoraClient().agents.getHistory(
      { appid: requireEnv('NEXT_PUBLIC_AGORA_APP_ID'), agentId },
      { ...agoraAuth(), timeoutInSeconds: 5 },
    );
    const turns = turnsFromHistory((history as { contents?: unknown }).contents);
    return turns.length ? rememberTurns(session.id, agentId, turns) : remembered();
  } catch (error) {
    // Usually the agent has already gone. Keep whatever was saved before.
    console.warn('Could not save the conversation:', error instanceof Error ? error.message.replace(/\s+/g, ' ').slice(0, 140) : error);
    return remembered();
  }
}

/** Whether a session holds anything worth carrying into a new agent. */
export function hasMemory(s: Session | undefined): boolean {
  return !!s && !!(s.bill || s.location || s.roof || s.design || s.survey || s.booking || s.turns?.length);
}

/** The earlier conversation as lines for the next agent's instructions, most recent last. */
export function conversationSoFar(id: string, maxTurns = 16): string {
  const turns = getSession(id)?.turns ?? [];
  return turns
    .slice(-maxTurns)
    .map((t) => `${t.role === 'user' ? 'Person' : 'Dhoop'}: ${t.text}`)
    .join('\n');
}
