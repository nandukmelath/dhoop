import type { Lang } from './config';
import { SQFT_PER_M2 } from './config';
import { SUBSIDY_STEPS } from './steps';
import type { Session } from './store';

/**
 * The solar passbook: what a household takes home from a conversation.
 *
 * One page on their own phone, in their own language, opened by scanning a code on the big
 * screen: the roof Dhoop found, the system, the money, and where the subsidy application
 * stands. It also has a voice note, spoken by the same Murf voice as the conversation, for the
 * person in the family who decides and does not read a screen of figures. And it leads back
 * into the conversation, on the phone, with everything remembered.
 *
 * This file is the page's words and the voice note's script. No server-only imports: only a type from the store.
 */

export interface PassbookWords {
  title: string;
  home: string;
  roof: string;
  panelsFit: string;
  system: string;
  billNow: string;
  billAfter: string;
  saving: string;
  price: string;
  subsidy: string;
  youPay: string;
  payback: string;
  years: string;
  loan: string;
  aMonth: string;
  panels: string;
  application: string;
  stage: string;
  next: string;
  listen: string;
  share: string;
  talk: string;
  estimate: string;
  empty: string;
  warning: string;
  shareLine: string;
}

export const PASSBOOK: Record<Lang, PassbookWords> = {
  en: {
    title: 'Solar passbook',
    home: 'Home',
    roof: 'Roof',
    panelsFit: 'Panels that fit',
    system: 'Suggested system',
    billNow: 'Bill now',
    billAfter: 'Bill with solar',
    saving: 'Saving a month',
    price: 'Price',
    subsidy: 'Government subsidy',
    youPay: 'You pay',
    payback: 'Pays for itself in',
    years: 'years',
    loan: 'Loan instalment',
    aMonth: 'month',
    panels: 'panels',
    application: 'Subsidy application',
    stage: 'Stage',
    next: 'Next',
    listen: 'Listen to your plan',
    share: 'Send on WhatsApp',
    talk: 'Talk to Dhoop about this',
    estimate: 'Estimate, not a quotation',
    empty: 'Nothing is written here yet. Talk to Dhoop first.',
    warning: 'Nobody from the scheme asks for an OTP or for money on the phone.',
    shareLine: 'Our solar plan from Dhoop',
  },
  hi: {
    title: 'सौर पासबुक',
    home: 'घर',
    roof: 'छत',
    panelsFit: 'जितने पैनल आएँगे',
    system: 'सुझाया गया सिस्टम',
    billNow: 'अभी का बिल',
    billAfter: 'सोलर के बाद बिल',
    saving: 'हर महीने बचत',
    price: 'कीमत',
    subsidy: 'सरकारी सब्सिडी',
    youPay: 'आप देंगे',
    payback: 'खर्च वसूल होगा',
    years: 'साल में',
    loan: 'लोन की किस्त',
    aMonth: 'महीना',
    panels: 'पैनल',
    application: 'सब्सिडी आवेदन',
    stage: 'चरण',
    next: 'अगला कदम',
    listen: 'अपना प्लान सुनिए',
    share: 'WhatsApp पर भेजें',
    talk: 'इस बारे में धूप से बात करें',
    estimate: 'अनुमान है, कोटेशन नहीं',
    empty: 'अभी यहाँ कुछ नहीं लिखा है। पहले धूप से बात कीजिए।',
    warning: 'योजना की ओर से कोई भी फ़ोन पर OTP या पैसे नहीं माँगता।',
    shareLine: 'धूप से मिला हमारा सोलर प्लान',
  },
  kn: {
    title: 'ಸೌರ ಪಾಸ್‌ಬುಕ್',
    home: 'ಮನೆ',
    roof: 'ಮೇಲ್ಛಾವಣಿ',
    panelsFit: 'ಹಿಡಿಯುವ ಪ್ಯಾನೆಲ್‌ಗಳು',
    system: 'ಸೂಚಿಸಿದ ಸಿಸ್ಟಮ್',
    billNow: 'ಈಗಿನ ಬಿಲ್',
    billAfter: 'ಸೋಲಾರ್ ನಂತರ ಬಿಲ್',
    saving: 'ತಿಂಗಳ ಉಳಿತಾಯ',
    price: 'ಬೆಲೆ',
    subsidy: 'ಸರ್ಕಾರದ ಸಬ್ಸಿಡಿ',
    youPay: 'ನೀವು ಕೊಡುವುದು',
    payback: 'ಹಣ ವಾಪಸ್ ಬರುವುದು',
    years: 'ವರ್ಷಗಳಲ್ಲಿ',
    loan: 'ಸಾಲದ ಕಂತು',
    aMonth: 'ತಿಂಗಳು',
    panels: 'ಪ್ಯಾನೆಲ್',
    application: 'ಸಬ್ಸಿಡಿ ಅರ್ಜಿ',
    stage: 'ಹಂತ',
    next: 'ಮುಂದಿನ ಹೆಜ್ಜೆ',
    listen: 'ನಿಮ್ಮ ಯೋಜನೆ ಕೇಳಿ',
    share: 'WhatsApp ನಲ್ಲಿ ಕಳುಹಿಸಿ',
    talk: 'ಇದರ ಬಗ್ಗೆ ಧೂಪ್ ಜೊತೆ ಮಾತಾಡಿ',
    estimate: 'ಅಂದಾಜು, ಕೊಟೇಶನ್ ಅಲ್ಲ',
    empty: 'ಇಲ್ಲಿ ಇನ್ನೂ ಏನೂ ಬರೆದಿಲ್ಲ. ಮೊದಲು ಧೂಪ್ ಜೊತೆ ಮಾತಾಡಿ.',
    warning: 'ಯೋಜನೆಯ ಕಡೆಯಿಂದ ಯಾರೂ ಫೋನ್‌ನಲ್ಲಿ OTP ಅಥವಾ ಹಣ ಕೇಳುವುದಿಲ್ಲ.',
    shareLine: 'ಧೂಪ್ ಕೊಟ್ಟ ನಮ್ಮ ಸೋಲಾರ್ ಯೋಜನೆ',
  },
  ta: {
    title: 'சோலார் பாஸ்புக்',
    home: 'வீடு',
    roof: 'கூரை',
    panelsFit: 'பொருத்தக்கூடிய பேனல்கள்',
    system: 'பரிந்துரைக்கும் சிஸ்டம்',
    billNow: 'இப்போதைய பில்',
    billAfter: 'சோலாருடன் பில்',
    saving: 'மாத சேமிப்பு',
    price: 'விலை',
    subsidy: 'அரசு மானியம்',
    youPay: 'நீங்கள் செலுத்துவது',
    payback: 'செலவு திரும்பக் கிடைக்க',
    years: 'ஆண்டுகள்',
    loan: 'கடன் தவணை',
    aMonth: 'மாதம்',
    panels: 'பேனல்கள்',
    application: 'மானிய விண்ணப்பம்',
    stage: 'கட்டம்',
    next: 'அடுத்தது',
    listen: 'உங்கள் திட்டத்தைக் கேளுங்கள்',
    share: 'WhatsApp-ல் அனுப்புங்கள்',
    talk: 'இதைப் பற்றி தூப்பிடம் பேசுங்கள்',
    estimate: 'மதிப்பீடு மட்டுமே, விலைப்புள்ளி அல்ல',
    empty: 'இங்கே இன்னும் எதுவும் எழுதப்படவில்லை. முதலில் தூப்பிடம் பேசுங்கள்.',
    warning: 'திட்டத்தின் பெயரில் யாரும் போனில் OTP அல்லது பணம் கேட்க மாட்டார்கள்.',
    shareLine: 'தூப் தந்த எங்கள் சோலார் திட்டம்',
  },
  te: {
    title: 'సోలార్ పాస్‌బుక్',
    home: 'ఇల్లు',
    roof: 'పైకప్పు',
    panelsFit: 'పట్టే ప్యానెళ్లు',
    system: 'సూచించిన సిస్టమ్',
    billNow: 'ఇప్పటి బిల్లు',
    billAfter: 'సోలార్‌తో బిల్లు',
    saving: 'నెలకు ఆదా',
    price: 'ధర',
    subsidy: 'ప్రభుత్వ సబ్సిడీ',
    youPay: 'మీరు చెల్లించేది',
    payback: 'ఖర్చు తిరిగి రావడానికి',
    years: 'సంవత్సరాలు',
    loan: 'లోన్ వాయిదా',
    aMonth: 'నెల',
    panels: 'ప్యానెళ్లు',
    application: 'సబ్సిడీ దరఖాస్తు',
    stage: 'దశ',
    next: 'తర్వాత',
    listen: 'మీ ప్లాన్ వినండి',
    share: 'WhatsAppలో పంపండి',
    talk: 'దీని గురించి ధూప్‌తో మాట్లాడండి',
    estimate: 'అంచనా మాత్రమే, కొటేషన్ కాదు',
    empty: 'ఇక్కడ ఇంకా ఏమీ రాయలేదు. ముందు ధూప్‌తో మాట్లాడండి.',
    warning: 'పథకం పేరుతో ఎవరూ ఫోన్‌లో OTP గానీ డబ్బు గానీ అడగరు.',
    shareLine: 'ధూప్ ఇచ్చిన మా సోలార్ ప్లాన్',
  },
  ml: {
    title: 'സോളാർ പാസ്ബുക്ക്',
    home: 'വീട്',
    roof: 'മേൽക്കൂര',
    panelsFit: 'വയ്ക്കാവുന്ന പാനലുകൾ',
    system: 'നിർദ്ദേശിച്ച സിസ്റ്റം',
    billNow: 'ഇപ്പോഴത്തെ ബിൽ',
    billAfter: 'സോളാറിനു ശേഷം ബിൽ',
    saving: 'മാസ ലാഭം',
    price: 'വില',
    subsidy: 'സർക്കാർ സബ്സിഡി',
    youPay: 'നിങ്ങൾ നൽകേണ്ടത്',
    payback: 'മുടക്കുമുതൽ തിരികെ കിട്ടുന്നത്',
    years: 'വർഷത്തിൽ',
    loan: 'ലോൺ തവണ',
    aMonth: 'മാസം',
    panels: 'പാനൽ',
    application: 'സബ്സിഡി അപേക്ഷ',
    stage: 'ഘട്ടം',
    next: 'അടുത്ത പടി',
    listen: 'നിങ്ങളുടെ പ്ലാൻ കേൾക്കൂ',
    share: 'WhatsApp-ൽ അയയ്ക്കൂ',
    talk: 'ഇതിനെക്കുറിച്ച് ധൂപിനോട് സംസാരിക്കൂ',
    estimate: 'ഏകദേശ കണക്ക്, ക്വട്ടേഷൻ അല്ല',
    empty: 'ഇവിടെ ഇതുവരെ ഒന്നും എഴുതിയിട്ടില്ല. ആദ്യം ധൂപിനോട് സംസാരിക്കൂ.',
    warning: 'പദ്ധതിയുടെ പേരിൽ ആരും ഫോണിൽ OTP-യോ പണമോ ചോദിക്കില്ല.',
    shareLine: 'ധൂപ് തന്ന ഞങ്ങളുടെ സോളാർ പ്ലാൻ',
  },
};

/** The Murf voice that speaks the note in each language: the same ones Dhoop talks in. */
const NOTE_VOICE: Record<Lang, { voiceId: string; locale: string }> = {
  en: { voiceId: 'hi-IN-jaya', locale: 'en-IN' },
  hi: { voiceId: 'hi-IN-jaya', locale: 'hi-IN' },
  kn: { voiceId: 'hi-IN-jaya', locale: 'kn-IN' },
  // Jaya, the voice of the conversation, also speaks Tamil and Telugu.
  ta: { voiceId: 'hi-IN-jaya', locale: 'ta-IN' },
  te: { voiceId: 'hi-IN-jaya', locale: 'te-IN' },
  ml: { voiceId: 'ml-IN-nimisha', locale: 'ml-IN' },
};

/** A figure made easy to say: 2,720 becomes 2,700. Small ones are left alone. */
const sayable = (n: number): string => {
  const step = n >= 100_000 ? 1000 : n >= 1000 ? 100 : n >= 100 ? 10 : 1;
  return (Math.round(n / step) * step).toLocaleString('en-IN');
};

/**
 * The script of the voice note, in the conversation's language, from what the session holds.
 * Null when there is nothing worth saying yet. Every figure comes from the session: the note
 * says nothing the page does not show.
 */
/** One sentence of the note and what it is about. The solar story gives each a scene of its own. */
export interface StoryPart {
  kind: 'hello' | 'roof' | 'system' | 'money' | 'application' | 'close';
  text: string;
}
/** What each line of the note is about, in the order the lines are written below. */
const PART_KINDS: StoryPart['kind'][] = ['hello', 'roof', 'system', 'money', 'application', 'close'];

/**
 * `short` is for the solar story on the big screen, where forty seconds is too long: the last
 * line keeps its first two sentences ("These are estimates. An installer confirms them.") and
 * leaves the caution about OTPs to the screen, which shows it in large letters as it ends.
 */
export function voiceNote(s: Session, inLang?: Lang, short = false): { text: string; parts: StoryPart[]; voiceId: string; locale: string } | null {
  // The note is in the conversation's language unless another is asked for: the person who
  // decides at home may not be the one who made the call, or speak the language it was in.
  const lang = inLang ?? (s.lang as Lang);
  const d = s.design;
  const r = s.roof;
  if (!d && !r) return null;
  const place = s.location?.label ?? '';
  const sqft = r ? sayable(r.areaM2 * SQFT_PER_M2) : '';
  const stages = s.application ? Math.min(s.application.stagesDone, SUBSIDY_STEPS.length) : -1;
  const say = {
    en: [
      `Hello. This is Dhoop, with the solar plan for your home${place ? ` in ${place}` : ''}.`,
      r ? `Your roof is about ${sqft} square feet, and has room for ${r.panelsFit} panels.` : '',
      d ? `For your bill of about ${sayable(d.billBefore)} rupees a month, I suggest a ${d.kw} kilowatt system. It should save you about ${sayable(d.monthlySavings)} rupees every month.` : '',
      d ? `The government subsidy is ${sayable(d.subsidy)} rupees, so you pay about ${sayable(d.netCost)} rupees, and it pays for itself in about ${d.paybackYears} years.` : '',
      stages >= 0 ? `In your subsidy application, ${stages} of ${SUBSIDY_STEPS.length} stages are done.` : '',
      'These are estimates. An installer confirms them at your home. And remember: nobody from the scheme asks for an O T P or for money on the phone.',
    ],
    hi: [
      `नमस्ते। मैं धूप हूँ। यह${place ? ` ${place} में` : ''} आपके घर का सोलर प्लान है।`,
      r ? `आपकी छत लगभग ${sqft} वर्ग फुट की है, और उस पर ${r.panelsFit} पैनल लग सकते हैं।` : '',
      d ? `आपके लगभग ${sayable(d.billBefore)} रुपये महीने के बिल के लिए मेरा सुझाव ${d.kw} किलोवाट का सिस्टम है। इससे हर महीने लगभग ${sayable(d.monthlySavings)} रुपये बचेंगे।` : '',
      d ? `सरकारी सब्सिडी ${sayable(d.subsidy)} रुपये है, तो आपको लगभग ${sayable(d.netCost)} रुपये देने होंगे, और लगभग ${d.paybackYears} साल में खर्च वसूल हो जाएगा।` : '',
      stages >= 0 ? `आपके सब्सिडी आवेदन के ${SUBSIDY_STEPS.length} में से ${stages} चरण पूरे हो चुके हैं।` : '',
      'ये अनुमान हैं। इंस्टॉलर आपके घर आकर इन्हें पक्का करेगा। और याद रखिए, योजना की ओर से कोई भी फ़ोन पर ओ टी पी या पैसे नहीं माँगता।',
    ],
    kn: [
      `ನಮಸ್ಕಾರ. ನಾನು ಧೂಪ್. ಇದು${place ? ` ${place} ನಲ್ಲಿರುವ` : ''} ನಿಮ್ಮ ಮನೆಯ ಸೋಲಾರ್ ಯೋಜನೆ.`,
      r ? `ನಿಮ್ಮ ಮೇಲ್ಛಾವಣಿ ಸುಮಾರು ${sqft} ಚದರ ಅಡಿ ಇದೆ, ಅದರಲ್ಲಿ ${r.panelsFit} ಪ್ಯಾನೆಲ್‌ಗಳು ಹಿಡಿಯುತ್ತವೆ.` : '',
      d ? `ತಿಂಗಳಿಗೆ ಸುಮಾರು ${sayable(d.billBefore)} ರೂಪಾಯಿ ಬಿಲ್‌ಗೆ ${d.kw} ಕಿಲೋವ್ಯಾಟ್ ಸಿಸ್ಟಮ್ ಸೂಕ್ತ. ಇದರಿಂದ ಪ್ರತಿ ತಿಂಗಳು ಸುಮಾರು ${sayable(d.monthlySavings)} ರೂಪಾಯಿ ಉಳಿಯುತ್ತದೆ.` : '',
      d ? `ಸರ್ಕಾರದ ಸಬ್ಸಿಡಿ ${sayable(d.subsidy)} ರೂಪಾಯಿ, ಹಾಗಾಗಿ ನೀವು ಸುಮಾರು ${sayable(d.netCost)} ರೂಪಾಯಿ ಕೊಡಬೇಕು, ಸುಮಾರು ${d.paybackYears} ವರ್ಷಗಳಲ್ಲಿ ಹಣ ವಾಪಸ್ ಬರುತ್ತದೆ.` : '',
      stages >= 0 ? `ನಿಮ್ಮ ಸಬ್ಸಿಡಿ ಅರ್ಜಿಯ ${SUBSIDY_STEPS.length} ಹಂತಗಳಲ್ಲಿ ${stages} ಮುಗಿದಿವೆ.` : '',
      'ಇವು ಅಂದಾಜುಗಳು. ಇನ್‌ಸ್ಟಾಲರ್ ನಿಮ್ಮ ಮನೆಗೆ ಬಂದು ಖಚಿತಪಡಿಸುತ್ತಾರೆ. ನೆನಪಿಡಿ, ಯೋಜನೆಯ ಕಡೆಯಿಂದ ಯಾರೂ ಫೋನ್‌ನಲ್ಲಿ ಓ ಟಿ ಪಿ ಅಥವಾ ಹಣ ಕೇಳುವುದಿಲ್ಲ.',
    ],
    ta: [
      `வணக்கம். நான் தூப். இது${place ? ` ${place} பகுதியில் உள்ள` : ''} உங்கள் வீட்டுக்கான சோலார் திட்டம்.`,
      r ? `உங்கள் கூரை சுமார் ${sqft} சதுர அடி. அதில் ${r.panelsFit} பேனல்கள் பொருத்தலாம்.` : '',
      d ? `மாதம் சுமார் ${sayable(d.billBefore)} ரூபாய் பில்லுக்கு ${d.kw} கிலோவாட் சிஸ்டம் பொருத்தமானது. இதனால் ஒவ்வொரு மாதமும் சுமார் ${sayable(d.monthlySavings)} ரூபாய் மிச்சமாகும்.` : '',
      d ? `அரசு மானியம் ${sayable(d.subsidy)} ரூபாய். எனவே நீங்கள் சுமார் ${sayable(d.netCost)} ரூபாய் செலுத்தினால் போதும். சுமார் ${d.paybackYears} ஆண்டுகளில் செலவு திரும்பக் கிடைக்கும்.` : '',
      stages >= 0 ? `உங்கள் மானிய விண்ணப்பத்தின் ${SUBSIDY_STEPS.length} கட்டங்களில் ${stages} முடிந்துள்ளன.` : '',
      'இவை மதிப்பீடுகள். இன்ஸ்டாலர் உங்கள் வீட்டுக்கு வந்து உறுதி செய்வார். நினைவில் கொள்ளுங்கள்: திட்டத்தின் பெயரில் யாரும் போனில் ஓ டி பி அல்லது பணம் கேட்க மாட்டார்கள்.',
    ],
    te: [
      `నమస్కారం. నేను ధూప్. ఇది${place ? ` ${place} ప్రాంతంలోని` : ''} మీ ఇంటి సోలార్ ప్లాన్.`,
      r ? `మీ పైకప్పు సుమారు ${sqft} చదరపు అడుగులు. దానిపై ${r.panelsFit} ప్యానెళ్లు పడతాయి.` : '',
      d ? `నెలకు సుమారు ${sayable(d.billBefore)} రూపాయల బిల్లుకు ${d.kw} కిలోవాట్ సిస్టమ్ సరిపోతుంది. దీంతో ప్రతి నెల సుమారు ${sayable(d.monthlySavings)} రూపాయలు ఆదా అవుతాయి.` : '',
      d ? `ప్రభుత్వ సబ్సిడీ ${sayable(d.subsidy)} రూపాయలు. కాబట్టి మీరు సుమారు ${sayable(d.netCost)} రూపాయలు చెల్లిస్తే చాలు. సుమారు ${d.paybackYears} సంవత్సరాల్లో ఖర్చు తిరిగి వస్తుంది.` : '',
      stages >= 0 ? `మీ సబ్సిడీ దరఖాస్తులో ${SUBSIDY_STEPS.length} దశల్లో ${stages} పూర్తయ్యాయి.` : '',
      'ఇవి అంచనాలు. ఇన్‌స్టాలర్ మీ ఇంటికి వచ్చి నిర్ధారిస్తారు. గుర్తుంచుకోండి: పథకం పేరుతో ఎవరూ ఫోన్‌లో ఓ టీ పీ గానీ డబ్బు గానీ అడగరు.',
    ],
    ml: [
      `നമസ്കാരം. ഞാൻ ധൂപ്. ഇത്${place ? ` ${place} ലെ` : ''} നിങ്ങളുടെ വീടിനുള്ള സോളാർ പ്ലാൻ ആണ്.`,
      r ? `നിങ്ങളുടെ മേൽക്കൂര ഏകദേശം ${sqft} ചതുരശ്ര അടിയാണ്, അതിൽ ${r.panelsFit} പാനലുകൾ വയ്ക്കാം.` : '',
      d ? `മാസം ഏകദേശം ${sayable(d.billBefore)} രൂപ ബില്ലിന് ${d.kw} കിലോവാട്ട് സിസ്റ്റം ആണ് നല്ലത്. ഇതുവഴി ഓരോ മാസവും ഏകദേശം ${sayable(d.monthlySavings)} രൂപ ലാഭിക്കാം.` : '',
      d ? `സർക്കാർ സബ്സിഡി ${sayable(d.subsidy)} രൂപയാണ്, അതിനാൽ നിങ്ങൾ ഏകദേശം ${sayable(d.netCost)} രൂപ നൽകിയാൽ മതി, ഏകദേശം ${d.paybackYears} വർഷത്തിൽ മുടക്കുമുതൽ തിരികെ കിട്ടും.` : '',
      stages >= 0 ? `നിങ്ങളുടെ സബ്സിഡി അപേക്ഷയുടെ ${SUBSIDY_STEPS.length} ഘട്ടങ്ങളിൽ ${stages} എണ്ണം കഴിഞ്ഞു.` : '',
      'ഇവ ഏകദേശ കണക്കുകളാണ്. ഇൻസ്റ്റാളർ വീട്ടിൽ വന്ന് ഉറപ്പാക്കും. ഓർക്കുക, പദ്ധതിയുടെ പേരിൽ ആരും ഫോണിൽ ഒ ടി പി യോ പണമോ ചോദിക്കില്ല.',
    ],
  }[lang] ?? [];
  // A sentence ends at a full stop, or at the Hindi danda.
  const firstTwo = (line: string) => line.match(/^.*?[.।]\s+.*?[.।]/)?.[0] ?? line;
  const parts = say.map((text, i) => ({ kind: PART_KINDS[i], text: short && PART_KINDS[i] === 'close' ? firstTwo(text) : text })).filter((p) => p.text);
  const text = parts.map((p) => p.text).join(' ');
  return text ? { text, parts, ...(NOTE_VOICE[lang] ?? NOTE_VOICE.en) } : null;
}
