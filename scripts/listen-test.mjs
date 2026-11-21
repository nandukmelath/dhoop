/**
 * A listening test: speaks sentences full of place names into a real call, as a stand-in
 * caller, and prints what the agent heard.
 *
 * Murf makes the clips, with two Indian voices a language. A headless copy of Chrome joins a
 * call from the app's own page, with a microphone that is really a sound file. So the speech
 * goes the road a person's does: browser, Agora's network, the recogniser. Then the "You"
 * lines of the transcript are read back and compared with what was said.
 *
 * Synthetic speech is cleaner than a person in a loud hall, so read the result as a
 * comparison between listening setups, not as the accuracy a person will get. Adding "hall"
 * mixes in three other people talking and some hiss, which is nearer to a demo floor.
 *
 * Needs the app running with its keys (npm run dev), Google Chrome, and macOS's afconvert.
 * It uses agent time: about two minutes a run.
 *   npm run listen:test -- en ares            English, Agora's recogniser with the place names
 *   npm run listen:test -- en ares-few        the same without them, to compare
 *   npm run listen:test -- ml deepgram-terms  Malayalam, Deepgram with its list of names
 *   npm run listen:test -- en ares hall       English again, with a noisy hall behind the speaker
 *   npm run listen:test -- pause ares!semantic  three sentences with a pause before the name
 * Add to a setup: "!semantic" or "!vad" for how the end of a sentence is judged, "!hold" to
 * work the hold-to-talk switch around each sentence, "!lock" for Agora's speaker lock, and
 * "!voice" for the lock following a sample of the caller's voice.
 * The setups are named in lib/dhoop/agent.ts. CHROME_PATH and DHOOP_URL override the usual places.
 */
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [lang = 'en', setup = 'ares', room = 'quiet'] = process.argv.slice(2);
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const APP = process.env.DHOOP_URL ?? 'http://localhost:3000';
const PORT = 9335;

/** What is said, and the names that should come through. "a|b" means either spelling counts. */
const SAID = {
  en: {
    button: 'English',
    locale: 'en-IN',
    voices: ['en-IN-aarav', 'en-IN-priya'],
    lines: [
      ['My home is in Tumakuru.', ['tumakuru|tumkur']],
      ['Show me the Vidhana Soudha in Bengaluru.', ['vidhana soudha|vidhan soudha|vidhana sauda', 'bengaluru|bangalore']],
      ['What about Lulu Mall in Kochi?', ['lulu mall', 'kochi|cochin']],
      ['My house is near the Sri Krishna Temple in Udupi.', ['krishna temple', 'udupi']],
      ['Can you find Manyata Tech Park?', ['manyata']],
      ['I live in Brookefield, near Kundalahalli gate.', ['brookefield|brookfield|brooke field', 'kundalahalli|kundalahali']],
      ['Show me the Mysore Palace.', ['mysore palace|mysuru palace']],
      ['I am from Thiruvananthapuram.', ['thiruvananthapuram|trivandrum']],
      ['My office is in Koramangala, and my bill is about three thousand two hundred rupees.', ['koramangala', '3200|3,200|three thousand two hundred']],
      ['Find the Polaris School of Technology.', ['polaris']],
    ],
  },
  // English with a pause before the name, the way people stop to think. A sentence given in parts is spoken with that many seconds of quiet between them.
  pause: {
    button: 'English',
    locale: 'en-IN',
    voices: ['en-IN-aarav', 'en-IN-priya'],
    lines: [
      [['My home is in', 1.0, 'Tumakuru.'], ['tumakuru|tumkur']],
      [['Show me the', 1.2, 'Vidhana Soudha in Bengaluru.'], ['vidhana soudha|vidhan soudha', 'bengaluru|bangalore']],
      [['I live near the', 0.9, 'Lulu Mall in Kochi.'], ['lulu mall', 'kochi|cochin']],
    ],
  },
  // The roof changed by speaking: a building by name, then the outline grown, a part left out, the neighbour, and back again.
  // What matters here is the list of things Dhoop did, printed at the end. Run it with DHOOP_LISTEN_GAP=14, so each change is drawn before the next is asked for.
  roof: {
    button: 'English',
    locale: 'en-IN',
    voices: ['en-IN-aarav', 'en-IN-priya'],
    lines: [
      ['Show me the Vidhana Soudha in Bengaluru.', ['vidhana soudha|vidhan soudha|vidhana sauda']],
      ['The roof is bigger than that. Add three hundred square metres on the right side and fit panels there too.', ['300|three hundred', 'right']],
      ['Leave out two thousand square feet at the front.', ['2000|2,000|two thousand', 'front']],
      ['That is not the building I meant. Take the next building to the left.', ['next building', 'left']],
      ['Undo that.', ['undo']],
    ],
  },
  hi: {
    button: 'हिन्दी',
    locale: 'hi-IN',
    voices: ['hi-IN-aman', 'hi-IN-shweta'],
    lines: [
      ['मेरा घर तुमकुरु में है।', ['तुमकुरु|तुमकूर|tumakuru|tumkur']],
      ['मुझे बेंगलुरु का विधान सौधा दिखाइए।', ['विधान सौध|vidhana soudha|vidhan soudha', 'बेंगलुरु|बैंगलोर|bengaluru|bangalore']],
      ['कोच्चि का लुलु मॉल दिखाइए।', ['लुलु मॉल|लूलू मॉल|lulu mall', 'कोच्चि|कोची|kochi']],
      ['मेरा घर उडुपी के श्री कृष्ण मंदिर के पास है।', ['उडुपी|उडूपी|udupi', 'कृष्ण मंदिर|krishna']],
      ['मैं ब्रुकफील्ड में रहता हूँ, कुंदलहल्ली गेट के पास।', ['ब्रुकफील्ड|ब्रूकफील्ड|brookefield|brookfield', 'कुंदलहल्ली|कुंडलहल्ली|kundalahalli']],
      ['मेरा बिजली का बिल लगभग तीन हज़ार दो सौ रुपये आता है।', ['3200|3,200|तीन हज़ार दो सौ|तीन हजार दो सौ']],
    ],
  },
  kn: {
    button: 'ಕನ್ನಡ',
    locale: 'kn-IN',
    voices: ['kn-IN-harshitha', 'en-IN-nikhil'],
    lines: [
      ['ನನ್ನ ಮನೆ ತುಮಕೂರಿನಲ್ಲಿದೆ.', ['ತುಮಕೂರ|tumakuru|tumkur']],
      ['ಬೆಂಗಳೂರಿನ ವಿಧಾನಸೌಧ ತೋರಿಸಿ.', ['ವಿಧಾನಸೌಧ|ವಿಧಾನ ಸೌಧ|vidhana soudha', 'ಬೆಂಗಳೂರ|bengaluru|bangalore']],
      ['ಕೊಚ್ಚಿಯ ಲುಲು ಮಾಲ್ ತೋರಿಸಿ.', ['ಲುಲು ಮಾಲ್|ಲೂಲೂ ಮಾಲ್|lulu mall', 'ಕೊಚ್ಚಿ|kochi']],
      ['ನನ್ನ ಮನೆ ಉಡುಪಿಯ ಶ್ರೀ ಕೃಷ್ಣ ದೇವಸ್ಥಾನದ ಹತ್ತಿರ ಇದೆ.', ['ಉಡುಪಿ|udupi', 'ಕೃಷ್ಣ|krishna']],
      ['ನಾನು ಬ್ರೂಕ್‌ಫೀಲ್ಡ್‌ನಲ್ಲಿ ಇದ್ದೇನೆ, ಕುಂದಲಹಳ್ಳಿ ಗೇಟ್ ಹತ್ತಿರ.', ['ಬ್ರೂಕ್|ಬ್ರುಕ್|brookefield|brookfield', 'ಕುಂದಲಹಳ್ಳಿ|kundalahalli']],
      ['ನನ್ನ ಕರೆಂಟ್ ಬಿಲ್ ತಿಂಗಳಿಗೆ ಸುಮಾರು ಮೂರು ಸಾವಿರದ ಇನ್ನೂರು ರೂಪಾಯಿ.', ['3200|3,200|ಮೂರು ಸಾವಿರ']],
    ],
  },
  ta: {
    button: 'தமிழ்',
    locale: 'ta-IN',
    voices: ['ta-IN-karthikeyan', 'en-IN-pooja'],
    lines: [
      ['என் வீடு கோயம்புத்தூரில் இருக்கிறது.', ['கோயம்புத்தூர|கோவை|coimbatore']],
      ['மதுரை மீனாட்சி அம்மன் கோயிலைக் காட்டுங்கள்.', ['மீனாட்சி|meenakshi', 'மதுரை|madurai']],
      ['என் கரண்ட் பில் மாதம் சுமார் மூவாயிரத்து இருநூறு ரூபாய்.', ['3200|3,200|மூவாயிரத்து|மூவாயிரம்']],
    ],
  },
  te: {
    button: 'తెలుగు',
    locale: 'te-IN',
    voices: ['en-IN-pooja', 'hi-IN-chirag'],
    lines: [
      ['మా ఇల్లు విజయవాడలో ఉంది.', ['విజయవాడ|vijayawada']],
      ['హైదరాబాద్‌లోని చార్మినార్ చూపించండి.', ['చార్మినార్|charminar', 'హైదరాబాద్|hyderabad']],
      ['నా కరెంట్ బిల్లు నెలకు సుమారు మూడు వేల రెండు వందల రూపాయలు.', ['3200|3,200|మూడు వేల']],
    ],
  },
  ml: {
    button: 'മലയാളം',
    locale: 'ml-IN',
    voices: ['ml-IN-madhavan', 'ml-IN-nimisha'],
    lines: [
      ['എന്റെ വീട് ഉഡുപ്പിയിലാണ്.', ['ഉഡുപ്പി|ഉടുപ്പി|udupi']],
      ['ബെംഗളൂരുവിലെ വിധാന സൗധ കാണിക്കൂ.', ['വിധാന സൗധ|വിധാൻ സൗധ|vidhana soudha', 'ബെംഗളൂരു|ബാംഗ്ലൂർ|bengaluru|bangalore']],
      ['കൊച്ചിയിലെ ലുലു മാൾ കാണിക്കൂ.', ['ലുലു മാൾ|lulu mall', 'കൊച്ചി|kochi']],
      ['ഞാൻ തിരുവനന്തപുരത്താണ് താമസിക്കുന്നത്.', ['തിരുവനന്തപുര|thiruvananthapuram|trivandrum']],
      ['എന്റെ ഓഫീസ് കോഴിക്കോടാണ്.', ['കോഴിക്കോ|kozhikode|calicut']],
      ['എന്റെ കറന്റ് ബിൽ മാസം ഏകദേശം മൂവായിരത്തി ഇരുനൂറ് രൂപയാണ്.', ['3200|3,200|മൂവായിര']],
    ],
  },
};
const test = SAID[lang];
if (!test) throw new Error(`no sentences for "${lang}". Use one of: ${Object.keys(SAID).join(', ')}`);
// A shorter run for trying the rig itself: DHOOP_LISTEN_LINES=2 speaks only the first two sentences.
if (process.env.DHOOP_LISTEN_LINES) test.lines = test.lines.slice(0, Number(process.env.DHOOP_LISTEN_LINES));

// 16 kHz is what speech recognition works at, and keeps the file small: Chrome plays nothing at all from a
// stand-in microphone file of about 10 MB or more.
const RATE = 16000;
/** Quiet before the first sentence, while the agent joins and greets. */
const LEAD_S = 16;
/** Quiet after each sentence, while the agent answers. */
const GAP_S = Number(process.env.DHOOP_LISTEN_GAP) || 9;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The Murf key is read where the app keeps it and never printed.
const key = (readFileSync(join(process.cwd(), '.env.local'), 'utf8').match(/^MURF_API_KEY=(.*)$/m) ?? [])[1]?.trim();
if (!key) throw new Error('MURF_API_KEY is not set in .env.local');

/** One sentence in a Murf voice, as raw sound: 16-bit, one channel. Kept, so a rerun does not ask Murf again. */
async function clip(text, voiceId, locale) {
  const kept = join(tmpdir(), 'dhoop-listen-clips');
  mkdirSync(kept, { recursive: true });
  const wav = join(kept, `${createHash('sha1').update(`${RATE}|${voiceId}|${locale}|${text}`).digest('hex').slice(0, 16)}.wav`);
  if (!existsSync(wav)) {
    const res = await fetch('https://global.api.murf.ai/v1/speech/stream', {
      method: 'POST',
      headers: { 'api-key': key, 'content-type': 'application/json' },
      body: JSON.stringify({ text, voiceId, model: 'FALCON', multiNativeLocale: locale, format: 'MP3', sampleRate: 24000 }),
    });
    if (!res.ok) throw new Error(`Murf answered ${res.status} for the voice ${voiceId}: ${(await res.text()).split(key).join('<key>').slice(0, 160)}`);
    const mp3 = `${wav}.mp3`;
    writeFileSync(mp3, Buffer.from(await res.arrayBuffer()));
    execFileSync('afconvert', ['-f', 'WAVE', '-d', `LEI16@${RATE}`, '-c', '1', mp3, wav]);
    rmSync(mp3);
  }
  // A sound file is a row of labelled chunks. The sound itself is the one labelled "data".
  const file = readFileSync(wav);
  for (let at = 12; at + 8 <= file.length; ) {
    const size = file.readUInt32LE(at + 4);
    if (file.toString('ascii', at, at + 4) === 'data') return file.subarray(at + 8, at + 8 + size);
    at += 8 + size + (size % 2);
  }
  throw new Error(`no sound in ${wav}`);
}

/** What three other people in the hall are saying, over and over, each in another voice. */
const HALL = [
  ['Did you finish the code for the payment screen, or is it still failing on the last step?', 'en-IN-samar'],
  ['I think we should go for lunch now and come back before the judges start their round.', 'en-IN-anusha'],
  ['Our demo needs one more laptop charger, and somebody has to keep the hotspot switched on.', 'en-IN-nikhil'],
];

/** How loud each of the three is beside the caller. A neighbour two metres away, heard by a laptop's microphone, is about this. */
const HALL_LOUDNESS = 0.18;

/** Mix a noisy hall under the speech: three voices that never stop, each much quieter than the speaker, and hiss. */
async function addHall(sound) {
  const out = new Int16Array(sound.buffer, sound.byteOffset, sound.length / 2).slice();
  for (const [layer, [text, voice]] of HALL.entries()) {
    const raw = await clip(text, voice, 'en-IN');
    const voiceOver = new Int16Array(raw.buffer, raw.byteOffset, raw.length / 2);
    const pause = Math.round(RATE * 0.7);
    const round = voiceOver.length + pause;
    // Each starts somewhere else in its sentence, so they overlap the way people do.
    const start = Math.round((round * layer) / HALL.length);
    for (let i = 0; i < out.length; i++) {
      const at = (i + start) % round;
      if (at < voiceOver.length) out[i] = Math.max(-32768, Math.min(32767, out[i] + voiceOver[at] * HALL_LOUDNESS));
    }
  }
  let seed = 7;
  for (let i = 0; i < out.length; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    out[i] = Math.max(-32768, Math.min(32767, out[i] + ((seed / 0x7fffffff) * 2 - 1) * 260));
  }
  return Buffer.from(out.buffer);
}

/**
 * A sample of the caller's own voice, for Agora's speaker lock to follow: about twelve seconds,
 * as bare 16 kHz 16-bit sound with no header, which is what Agora asks for.
 */
async function voiceprint(path) {
  const sample = await clip('Hello, this is my voice. I am going to ask about solar panels for my roof, about my electricity bill, and about the subsidy from the government. I will name the town I live in and a few buildings near my home. Please listen only to me, and not to the people around me.', test.voices[0], test.locale);
  writeFileSync(path, sample);
  return sample.length / 2 / RATE;
}

/** When each sentence starts and ends, in seconds from the start of the sound file. */
const spoken = [];

/** The whole "microphone": quiet, then each sentence with quiet after it. */
async function microphone(path) {
  const quiet = (seconds) => Buffer.alloc(Math.round(seconds * RATE) * 2);
  const parts = [quiet(LEAD_S)];
  const length = () => parts.reduce((sum, p) => sum + p.length, 0) / 2 / RATE;
  for (const [i, [text]] of test.lines.entries()) {
    const voice = test.voices[process.env.DHOOP_LISTEN_TWO_VOICES ? i % test.voices.length : 0];
    const from = length();
    for (const piece of Array.isArray(text) ? text : [text]) parts.push(typeof piece === 'number' ? quiet(piece) : await clip(piece, voice, test.locale));
    spoken.push({ from, to: length() });
    parts.push(quiet(GAP_S));
  }
  const sound = room === 'hall' ? await addHall(Buffer.concat(parts)) : Buffer.concat(parts);
  const head = Buffer.alloc(44);
  head.write('RIFF', 0);
  head.writeUInt32LE(36 + sound.length, 4);
  head.write('WAVEfmt ', 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(RATE, 24);
  head.writeUInt32LE(RATE * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write('data', 36);
  head.writeUInt32LE(sound.length, 40);
  writeFileSync(path, Buffer.concat([head, sound]));
  return sound.length / 2 / RATE;
}

const plain = (s) => s.toLowerCase().replace(/[.,!?।॥'"‘’“”\-–—]/g, ' ').replace(/\s+/g, ' ').trim();
const heardIn = (heard, names) => names.split('|').some((name) => plain(heard).includes(plain(name)));

const work = mkdtempSync(join(tmpdir(), 'dhoop-listen-'));
const mic = join(work, 'microphone.wav');
const seconds = await microphone(mic);
// A voice sample for the speaker lock, where the app's own address serves it to Agora.
const sampleFile = join(process.cwd(), 'public', 'voiceprint-test.pcm');
if (setup.includes('!voice')) console.log(`Voice sample for the speaker lock: ${(await voiceprint(sampleFile)).toFixed(1)} seconds.`);
console.log(`Speaking ${test.lines.length} sentences in ${lang} to the "${setup}" setup, in a ${room} room. About ${Math.round(seconds + 25)} seconds of agent time.`);

const chrome = spawn(
  CHROME,
  [
    '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(work, 'profile')}`, '--window-size=1280,900', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    // The page is given a microphone and camera without being asked, and the microphone is the sound file, played once.
    '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${mic}%noloop`, '--autoplay-policy=no-user-gesture-required',
    // Chrome's sound process is not allowed to read files, and then the microphone is silent. This lets it, in this throwaway browser only.
    '--disable-features=AudioServiceSandbox', 'about:blank',
  ],
  { stdio: 'ignore' },
);

let socket;
let lastId = 0;
const waiting = new Map();
const send = (method, params = {}, limit = 20000) =>
  Promise.race([
    new Promise((done, fail) => {
      const id = ++lastId;
      waiting.set(id, { done, fail });
      socket.send(JSON.stringify({ id, method, params }));
    }),
    sleep(limit).then(() => {
      throw new Error(`${method} gave no answer in ${limit} ms`);
    }),
  ]);
const inPage = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
};
/** Press the first button, or tick or untick the first checkbox, whose label starts with these words. */
const press = (words) => inPage(`(() => { const el = [...document.querySelectorAll('button, label')].find((x) => x.textContent.trim().startsWith(${JSON.stringify(words)})); if (el) el.click(); return !!el; })()`);
/** What the transcript shows: each turn with who spoke. */
const turns = () =>
  inPage(`(() => {
    const text = document.body.innerText;
    const from = text.toLowerCase().indexOf('transcript');
    const to = text.indexOf('Your roof');
    const lines = text.slice(from < 0 ? 0 : from, to < 0 ? undefined : to).split('\\n').map((l) => l.trim()).filter(Boolean);
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i] !== 'You' && lines[i] !== 'Agent') continue;
      const words = [];
      for (let j = i + 2; j < lines.length && lines[j] !== 'You' && lines[j] !== 'Agent'; j++) words.push(lines[j]);
      out.push({ who: lines[i], text: words.join(' ') });
    }
    return out;
  })()`);

let failed = false;
const engineErrors = new Set();
try {
  let address;
  for (let i = 0; i < 60 && !address; i++) {
    try {
      address = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page')?.webSocketDebuggerUrl;
    } catch {
      // Chrome is still starting.
    }
    if (!address) await sleep(200);
  }
  if (!address) throw new Error(`Chrome did not start. Is it at ${CHROME}?`);
  socket = new WebSocket(address);
  await new Promise((opened, refused) => {
    socket.onopen = opened;
    socket.onerror = () => refused(new Error('could not connect to Chrome'));
  });
  socket.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    // The app writes the engine's errors in full to the browser's console.
    if (msg.method === 'Runtime.consoleAPICalled' && String(msg.params.args?.[0]?.value).startsWith('Dhoop agent error')) engineErrors.add(String(msg.params.args?.[1]?.value).slice(0, 400));
    const wait = msg.id && waiting.get(msg.id);
    if (!wait) return;
    waiting.delete(msg.id);
    if (msg.error) wait.fail(new Error(msg.error.message));
    else wait.done(msg.result);
  };
  await send('Page.enable');
  await send('Runtime.enable');
  // The sound file starts when the page opens its microphone. Note when that is.
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => { const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices); navigator.mediaDevices.getUserMedia = async (c) => { const s = await real(c); if (c && c.audio) window.__micOpenedAt = Date.now(); return s; }; })()`,
  });
  await send('Page.navigate', { url: `${APP}/?stt=${encodeURIComponent(setup)}` });
  let ready = false;
  for (let i = 0; i < 80 && !ready; i++) {
    ready = await inPage(`[...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Start talking')`).catch(() => false);
    if (!ready) await sleep(250);
  }
  if (!ready) throw new Error(`the start page did not open at ${APP}. Is the app running?`);
  // The page is drawn before its buttons work. Give it a moment, then press until it takes.
  await sleep(3000);
  await press(test.button);
  // No camera and no location: this test is about listening.
  await inPage(`document.querySelectorAll('input[type=checkbox]').forEach((box) => { if (box.checked) box.click(); })`);
  for (let tries = 0; tries < 4; tries++) {
    if (!(await press('Start talking'))) break;
    await sleep(2500);
  }

  // The sound file starts when the page opens its microphone. Wait for all of it, and for the last answer.
  let connected = false;
  for (let i = 0; i < 100 && !connected; i++) {
    connected = (await turns().catch(() => [])).some((t) => t.who === 'Agent');
    if (!connected) await sleep(300);
  }
  if (!connected) {
    const page = await inPage(`document.body.innerText`);
    const trouble = page.split('\n').filter((l) => /error|could not|cannot|can't|failed|denied|blocked|not set|missing/i.test(l)).join(' | ');
    throw new Error(`the agent did not speak. The page says: ${trouble || page.replace(/\s+/g, ' ').slice(-300)}`);
  }
  // The space bar, as a person presses it. A short tap switches the one microphone button; held down, the microphone stays on while it is held.
  const key = (type) => send('Input.dispatchKeyEvent', { type, code: 'Space', key: ' ', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 });
  const tap = async () => {
    await key('keyDown');
    await sleep(120);
    await key('keyUp');
    await sleep(700);
  };
  if (setup.includes('!shut')) {
    // The microphone turned off and left off: nothing at all should be heard.
    await tap();
    await sleep((seconds - LEAD_S + 14) * 1000);
  } else if (setup.includes('!hold')) {
    // Work the button as a person would in a loud hall: off to begin with, then the space bar down just before each sentence and up just after.
    await tap();
    const opened = await inPage(`window.__micOpenedAt`);
    for (const { from, to } of spoken) {
      await sleep(Math.max(0, opened + (from - 0.4) * 1000 - Date.now()));
      await key('keyDown');
      await sleep(Math.max(0, opened + (to + 0.3) * 1000 - Date.now()));
      await key('keyUp');
    }
    await sleep(14000);
  } else await sleep((seconds - LEAD_S + 14) * 1000);

  // An engine error is a fault in the setup, such as a keyword the recogniser refuses. Show all the page says about it.
  const screen = await inPage(`document.body.innerText`);
  const errorAt = screen.indexOf('Conversation AI Engine Error');
  if (errorAt >= 0) console.log(`The engine reported: ${screen.slice(errorAt, errorAt + 420).replace(/\s+/g, ' ')}`);
  for (const e of engineErrors) console.log(`Engine error in full: ${e}`);
  const all = await turns();
  const heard = all.filter((t) => t.who === 'You').map((t) => t.text);
  if (!heard.length) {
    // Nothing heard at all is a fault in the rig, not in the recogniser. Say what the page shows.
    const page = await inPage(`document.body.innerText`);
    const from = page.indexOf('Connection Details');
    console.log(`No turn of the caller's reached the transcript. The call screen says: ${page.slice(from < 0 ? 0 : from, (from < 0 ? 0 : from) + 700).replace(/\s+/g, ' ')}`);
  }
  const everything = heard.join(' ');
  let right = 0;
  let total = 0;
  console.log('');
  for (const [saying, names] of test.lines) {
    const said = Array.isArray(saying) ? saying.filter((p) => typeof p === 'string').join(' … ') : saying;
    // The turn that shares most words with what was said is what the agent made of it.
    const words = new Set(plain(said).split(' '));
    const best = heard.map((h) => ({ h, n: plain(h).split(' ').filter((w) => words.has(w)).length })).sort((a, b) => b.n - a.n)[0];
    const marks = names.map((n) => {
      const ok = heardIn(best?.h ?? '', n) || heardIn(everything, n);
      total += 1;
      if (ok) right += 1;
      return `${ok ? 'heard' : 'MISSED'} ${n.split('|')[0]}`;
    });
    console.log(`said:  ${said}\nheard: ${best?.n ? best.h : '(nothing like it)'}\n       ${marks.join(', ')}\n`);
  }
  console.log(`RESULT ${lang} ${setup} ${room}: ${right} of ${total} names heard right, in ${heard.length} turns for ${test.lines.length} sentences.`);
  // What the agent did with what it heard: its tools are called from Agora's cloud through the public address.
  const did = await inPage(`(async () => { try { const channel = JSON.parse(window.localStorage.getItem('dhoop.conversation')).channel; const s = await (await fetch('/api/session/' + channel)).json(); return (s.log || []).map((l) => l.text).reverse(); } catch { return []; } })()`);
  console.log(did.length ? `Dhoop then did ${did.length} thing${did.length > 1 ? 's' : ''}: ${did.join(' | ').slice(0, 600)}` : 'Dhoop used none of its tools. If it should have, check the public address.');
  await press('End');
  await inPage(`(() => { const b = [...document.querySelectorAll('button')].find((x) => (x.getAttribute('aria-label') || '').startsWith('End conversation')); if (b) b.click(); return !!b; })()`);
  await sleep(4000);
} catch (error) {
  failed = true;
  console.log(`The test did not finish: ${String(error?.message ?? error).slice(0, 400)}`);
} finally {
  try {
    socket?.close();
  } catch {
    // Already closed.
  }
  chrome.kill();
  await sleep(1200);
  rmSync(sampleFile, { force: true });
  try {
    rmSync(work, { recursive: true, force: true, maxRetries: 8, retryDelay: 400 });
  } catch {
    console.log(`Left behind, and safe to delete: ${work}`);
  }
}
process.exit(failed ? 1 : 0);
