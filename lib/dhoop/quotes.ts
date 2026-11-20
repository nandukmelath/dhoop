import type { Lang } from './config';
import { agoraAuth, agoraClient, requireEnv } from './server';
import { inr } from './solar';
import { getSession, newId, updateSession, type Quote } from './store';
import { redesignWithQuotes } from './tools';

/** Installer quotes, and the agent speaking up by itself when one arrives. */

const ARRIVED: Record<Lang, (who: string) => string> = {
  en: (who) => `A quote has just come in from ${who}. Shall I read it out?`,
  hi: (who) => `${who} की तरफ़ से अभी एक कोटेशन आया है। क्या मैं पढ़कर सुनाऊँ?`,
  kn: (who) => `${who} ಅವರಿಂದ ಈಗ ಒಂದು ಕೊಟೇಶನ್ ಬಂದಿದೆ. ಓದಿ ಹೇಳಲೇ?`,
  ta: (who) => `${who} இடமிருந்து இப்போது ஒரு கொட்டேஷன் வந்துள்ளது. படித்துச் சொல்லட்டுமா?`,
  te: (who) => `${who} నుంచి ఇప్పుడే ఒక కొటేషన్ వచ్చింది. చదివి వినిపించనా?`,
  ml: (who) => `${who} ഇപ്പോൾ ഒരു ക്വട്ടേഷൻ അയച്ചിട്ടുണ്ട്. ഞാൻ വായിച്ചു കേൾപ്പിക്കട്ടെ?`,
};

/** Ask the running agent to say something without being asked. Best effort. */
export async function agentSay(sid: string, text: string): Promise<boolean> {
  const s = getSession(sid);
  if (!s?.agentId) return false;
  try {
    const client = agoraClient();
    await client.agents.speak(
      {
        appid: requireEnv('NEXT_PUBLIC_AGORA_APP_ID'),
        agentId: s.agentId,
        text: text.slice(0, 160),
        priority: 'APPEND',
        interruptable: true,
      },
      agoraAuth(),
    );
    return true;
  } catch (error) {
    console.warn('agentSay failed:', error instanceof Error ? error.message : error);
    return false;
  }
}

export async function addQuote(sid: string, q: { installer: string; price: number; days: number; note?: string }): Promise<Quote | undefined> {
  const s = getSession(sid);
  if (!s?.survey) return undefined;
  const quote: Quote = { id: newId('q'), installer: q.installer.slice(0, 60), price: Math.round(q.price), days: Math.round(q.days), note: q.note?.slice(0, 140), at: Date.now() };
  updateSession(
    sid,
    (x) => {
      x.quotes.push(quote);
      if (x.view !== 'booked') x.view = 'quotes';
    },
    { kind: 'quote', text: `Quote from ${quote.installer}: ${inr(quote.price)}, ${quote.days} days` },
  );
  redesignWithQuotes(sid);
  // The follow-up: the agent speaks up on its own. The screen also shows the quote either way.
  void agentSay(sid, ARRIVED[s.lang](quote.installer));
  return quote;
}

/**
 * For a solo run with no installers present: two clearly labelled sample quotes arrive after
 * a short wait. Off unless DHOOP_SAMPLE_QUOTES=1. Needs a long-running server process.
 */
export function scheduleSampleQuotes(sid: string) {
  if (process.env.DHOOP_SAMPLE_QUOTES !== '1') return;
  const s = getSession(sid);
  const kw = s?.design?.kw ?? 3;
  const samples = [
    { installer: 'Sample Installer A', price: kw * 58_000, days: 12, note: 'Sample quote for demonstration, not a real offer.' },
    { installer: 'Sample Installer B', price: kw * 62_500, days: 7, note: 'Sample quote for demonstration, not a real offer.' },
  ];
  samples.forEach((q, i) => setTimeout(() => void addQuote(sid, q), 15_000 + i * 14_000));
}
