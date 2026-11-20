import { Agent, AresSTT, DeepgramSTT, MiniMaxTTS, MurfTTS, OpenAI, type AgoraClient, type TurnDetectionLanguage } from 'agora-agents';
import { LANGS, type Lang } from './config';
import { hotwords, keyterms, MOST_HOTWORDS, SAFE_HOTWORDS } from './hotwords';
import { conversationSoFar } from './memory';
import { FAILURE_LINES, GREETINGS, RECOVER_LINES, RESUME_LINES, RETURN_LINES, systemPrompt } from './prompt';
import { getSession } from './store';
import { agoraTools, sessionBrief } from './tools';

/**
 * Builds the Dhoop agent: Agora's speech recognition, an Agora-managed model that can see
 * the camera and call our tools, and a Murf Falcon voice. Kept in one place so the start
 * route and the offline config check use exactly the same settings.
 */

export interface AgentSpec {
  client: AgoraClient;
  lang: Lang;
  /** Session id shared with the tools and the screens. */
  sid: string;
  cameraOn: boolean;
  /** True when the agent is rejoining a conversation already under way. */
  resume: boolean;
  /** True when the person has come back in a later call, as opposed to changing language mid-call. */
  returning?: boolean;
  /** Public address of this app. Without it the agent gets no tools. */
  toolsBase?: string;
  toolSecret: string;
  murfKey?: string;
  /** Which listening setup to use, when not the usual one for the language. For comparing them by test. */
  listening?: Listening;
  /** True when no sound can reach Agora at all (the microphone is refused). Listening then uses the plainest setup. */
  plainListening?: boolean;
  /** True when this agent replaces one whose recogniser failed in the middle of a call. It asks the person to say it again. */
  recovering?: boolean;
  /** For tests: add the one keyword known to stop the recogniser, to see the app recover from it. */
  badName?: boolean;
  /** For tests: how the end of a sentence is judged, when not the usual way. */
  endOfSpeech?: 'vad' | 'semantic';
  /** For tests: switch Agora's speaker lock on or off, whatever DHOOP_SPEAKER_LOCK says. */
  speakerLock?: boolean;
  /**
   * The public address of a sample of one person's voice. With it the speaker lock follows that
   * voice from the first word, instead of whoever happens to speak clearly first.
   */
  voiceprint?: string;
  /** For tests: use only this many of the names to expect, and skip this many first. */
  nameLimit?: number;
  nameSkip?: number;
}

/**
 * How the agent listens. 'ares' is Agora's own recogniser with the full list of names to
 * expect, and 'deepgram-terms' is Agora-managed Deepgram with its shorter list. The other two
 * are the same recognisers without the names, kept so the difference can be measured:
 * see scripts/listen-test.mjs.
 */
export type Listening = 'ares' | 'ares-few' | 'deepgram' | 'deepgram-terms';
export const LISTENINGS: Listening[] = ['ares', 'ares-few', 'deepgram', 'deepgram-terms'];

/** A recogniser by its maker: Agora's own, or Deepgram run by Agora. */
export type Engine = 'ares' | 'deepgram';
export const engineOf = (listening: Listening): Engine => (listening.startsWith('deepgram') ? 'deepgram' : 'ares');

/** How long a recogniser that failed to start is left alone before a new call tries it again. */
export const TROUBLE_MS = 20 * 60_000;
const trouble = () => ((globalThis as unknown as { __dhoopTrouble?: Partial<Record<Engine, number>> }).__dhoopTrouble ??= {});
/** Remember that a recogniser failed to start, so the calls that follow do not walk into the same wall. */
export function noteListeningFailed(engine: Engine, at = Date.now()) {
  trouble()[engine] = at;
}
export function forgetListeningTrouble() {
  delete trouble().ares;
  delete trouble().deepgram;
}

/**
 * Which listening setup a new agent gets.
 *
 * Agora's own recogniser comes first, with Deepgram for the languages it lacks. But either can
 * have a bad spell: around noon on 20 Nov 2026 Agora's failed to start in 8 calls of 12,
 * whichever list of names it was given, after failing in none of 10 that morning, while
 * Deepgram failed in 1 of 6. So a call whose recogniser fails changes to the other one
 * (`failed`), and for the next twenty minutes new calls start on the other one too.
 */
export function chooseListening(lang: Lang, o: { failed?: Listening; plain?: boolean; forced?: Listening; now?: number } = {}): Listening {
  const onlyDeepgram = !!LANGS[lang].deepgram || process.env.DHOOP_STT === 'deepgram';
  const canChange = DEEPGRAM_PROVEN.includes(lang);
  if (o.failed) {
    if (onlyDeepgram) return 'deepgram';
    return engineOf(o.failed) === 'ares' && canChange ? 'deepgram-terms' : 'ares-few';
  }
  if (o.forced) return o.forced;
  if (o.plain) return onlyDeepgram ? 'deepgram' : 'ares-few';
  if (onlyDeepgram) return 'deepgram-terms';
  const now = o.now ?? Date.now();
  const bad = (engine: Engine) => {
    const at = trouble()[engine];
    return at !== undefined && now - at < TROUBLE_MS;
  };
  if (!bad('ares') || !canChange) return 'ares';
  if (!bad('deepgram')) return 'deepgram-terms';
  // Both have failed lately: the one whose failure is older has had longer to get well.
  return (trouble().ares ?? 0) <= (trouble().deepgram ?? 0) ? 'ares' : 'deepgram-terms';
}

/** The few keywords Dhoop first shipped with, before place names were added. */
const FIRST_KEYWORDS = ['Dhoop', 'solar', 'subsidy', 'kilowatt', 'Surya Ghar', 'BESCOM', 'net meter'];
/** The language codes Deepgram uses. */
const DEEPGRAM_LANGUAGE: Record<Lang, string> = { en: 'en-IN', hi: 'hi', kn: 'kn', ta: 'ta', te: 'te', ml: 'ml' };
/**
 * The languages Deepgram has been heard to work in through Agora, in a real call. A call is
 * only moved to Deepgram in one of these: an agent asked to listen in a language its
 * recogniser lacks may not start at all, which is worse than the failure being escaped.
 */
export const DEEPGRAM_PROVEN: Lang[] = ['en', 'hi', 'kn', 'ta', 'te', 'ml'];

/**
 * A voice that grew up in the language, where the shared voice would speak it as a visitor.
 * Jaya is a Hindi voice that Murf also offers in English and Kannada. For Malayalam Murf has
 * native voices, and Nimisha is the one closest to Jaya.
 */
const NATIVE_VOICE: Partial<Record<Lang, string>> = { ml: 'Nimisha' };

/** The Murf Falcon voice for a language. Override one language with MURF_VOICE_ID_ML and so on, or all of them with MURF_VOICE_ID. */
export function murfVoice(lang: Lang): string {
  return process.env[`MURF_VOICE_ID_${lang.toUpperCase()}`] || process.env.MURF_VOICE_ID || NATIVE_VOICE[lang] || 'Jaya';
}

export function buildAgent(spec: AgentSpec) {
  const { client, lang, sid, cameraOn, resume, returning, toolsBase, toolSecret, murfKey } = spec;
  const toolsOn = !!toolsBase;
  const tools = toolsOn ? agoraTools(toolsBase!, sid, toolSecret) : undefined;
  const speakerLock = !!spec.voiceprint || (spec.speakerLock ?? process.env.DHOOP_SPEAKER_LOCK === '1');
  // Deepgram does the listening for languages Agora's own recogniser lacks (Malayalam), for
  // any language when DHOOP_STT=deepgram, and for a while after Agora's own has failed to start.
  const listening: Listening = spec.listening ?? chooseListening(lang, { plain: spec.plainListening });
  const endOfSpeech = spec.endOfSpeech ?? 'semantic';
  const deepgram = listening.startsWith('deepgram');
  // What this conversation has already named is the likeliest to be said again.
  const session = getSession(sid);
  const named = [session?.location?.label, session?.roof?.name];
  // What the header on screen names. Keep it in step with the three choices below.
  const pipeline = {
    stt: deepgram ? 'Deepgram STT' : 'Agora ARES STT',
    llm: 'GPT-4o mini LLM',
    tts: murfKey ? 'Murf Falcon TTS' : 'MiniMax TTS',
  };

  const agent = new Agent({
    client,
    // The interaction language also sets the speech recognition language.
    turnDetection: {
      language: LANGS[lang].asr as TurnDetectionLanguage,
      config: {
        speech_threshold: 0.5,
        start_of_speech: {
          mode: 'vad',
          vad_config: { interrupt_duration_ms: 160, prefix_padding_ms: 300 },
        },
        // "semantic" has the engine judge from the words whether the person has finished, so a
        // pause before a name ("show me the ... Vidhana Soudha") does not end the turn.
        end_of_speech:
          endOfSpeech === 'semantic'
            ? // pause_state_enabled is off on purpose. With it on, a sentence that trails off ("...and there, for me") is
              // taken as "hold on", and the agent waits in silence for more instead of answering: the call looks stuck.
              { mode: 'semantic', semantic_config: { silence_duration_ms: 480, max_wait_ms: 2500, pause_state_enabled: false } }
            : { mode: 'vad', vad_config: { silence_duration_ms: 560 } },
      },
    },
    // RTM carries transcripts, agent state and latency metrics to the browser.
    // enable_tools lets the engine call our REST tools. Speaker lock helps in a loud hall.
    advancedFeatures: { enable_rtm: true, enable_tools: toolsOn, ...(speakerLock ? { enable_sal: true } : {}) },
    ...(speakerLock ? { sal: { sal_mode: 'locking' as const, ...(spec.voiceprint ? { sample_urls: { speaker: spec.voiceprint } } : {}) } } : {}),
    parameters: {
      audio_scenario: 'chorus',
      data_channel: 'rtm',
      enable_error_message: true,
      enable_metrics: true,
    },
  })
    // Both recognisers are Agora-managed and need no key. Each is told which names to expect:
    // place names are what ordinary speech models get wrong. See lib/dhoop/hotwords.ts.
    .withStt(
      deepgram
        ? new DeepgramSTT({
            model: 'nova-3',
            language: DEEPGRAM_LANGUAGE[lang],
            // Deepgram takes one keyterm per "keyterm=" in its address, and Agora passes this string into that address.
            ...(listening === 'deepgram-terms' ? { keyterm: keyterms(lang, named).map(encodeURIComponent).join('&keyterm=') } : {}),
          })
        : new AresSTT({ keywords: listening === 'ares-few' ? FIRST_KEYWORDS : [...hotwords(lang, named, MOST_HOTWORDS).slice(spec.nameSkip ?? 0, (spec.nameSkip ?? 0) + (spec.nameLimit ?? SAFE_HOTWORDS)), ...(spec.badName ? ['Patna'] : [])] }),
    )
    // Agora-managed model (no key). gpt-4o-mini can read camera frames.
    .withLlm(
      new OpenAI({
        model: 'gpt-4o-mini',
        // A new agent starts with an empty history, so what was said before travels in its instructions.
        systemMessages: [{ role: 'system', content: systemPrompt(lang, { toolsOn, cameraOn, brief: sessionBrief(sid), earlier: resume ? conversationSoFar(sid) : '' }) }],
        greetingMessage: resume ? (spec.recovering ? RECOVER_LINES[lang] : returning ? RETURN_LINES[lang] : RESUME_LINES[lang]) : GREETINGS[lang],
        failureMessage: FAILURE_LINES[lang],
        maxHistory: 24,
        inputModalities: cameraOn ? ['text', 'image'] : ['text'],
        params: { max_tokens: 400, temperature: 0.4 },
        ...(tools ? { tools } : {}),
      }),
    )
    // Murf Falcon is the voice. Without a Murf key the app still runs on Agora's default
    // voice, so the rest can be tested, and the screen says so.
    .withTts(
      murfKey
        ? new MurfTTS({
            key: murfKey,
            voiceId: murfVoice(lang),
            locale: LANGS[lang].murfLocale,
            model: 'FALCON',
            sampleRate: 24000,
            // Murf's streaming endpoint. Regional endpoints exist; see Murf's docs before changing it.
            baseUrl: process.env.MURF_BASE_URL || 'wss://global.api.murf.ai/v1/speech/stream-input',
          })
        : new MiniMaxTTS({ model: 'speech_2_6_turbo', voiceId: 'English_captivating_female1' }),
    );

  return { agent, toolsOn, voice: (murfKey ? 'murf' : 'default') as 'murf' | 'default', pipeline, listening };
}
