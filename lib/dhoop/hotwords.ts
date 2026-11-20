import type { Lang } from './config';

/**
 * Names the speech recogniser is told to expect.
 *
 * A recogniser trained on everyday speech hears "Tumakuru" as "to my guru" and "Vidhana
 * Soudha" as almost anything. Agora's own recogniser (ARES) takes a list of up to 128
 * keywords for exactly this: names of places, people and products that are not dictionary
 * words. Agora's advice is to list the names most likely to be misheard, to leave out common
 * words, and for a language other than English to give a name in that language's script
 * beside its English spelling. This file is that list for Dhoop.
 *
 * What a conversation has already named (the home's town, a building found) goes first,
 * because it is the likeliest to be said again.
 *
 * A warning learnt by test: one keyword can stop the recogniser altogether. With "Patna" in
 * the list, alone or among a hundred others, the engine answered "The speech recognition
 * service failed" and heard nothing for the whole call, five times in six. Nothing in Agora's
 * documents says which words do this. So every name here has been through a real call
 * (npm run listen:test), and a name added later should go through one too.
 */

/** The most keywords Agora's recogniser accepts. */
export const MOST_HOTWORDS = 128;
/**
 * The most Dhoop sends. Measured on 20 Nov 2026 with short test calls: with about 114 keywords
 * the recogniser failed to start in 2 calls of 4 ("The speech recognition service failed"),
 * with 30 in none of 8, and with 7 never. So the list is kept short and the likeliest names go
 * first. The app also recovers by itself if it does fail: see recoverListening in DhoopApp.tsx.
 */
export const SAFE_HOTWORDS = 30;

/** Words of the trade that are not everyday speech. */
const TRADE = ['Dhoop', 'Surya Ghar', 'BESCOM', 'net meter', 'kilowatt', 'subsidy', 'rooftop solar'];

/**
 * Places a person in this hall is likely to name, each in English, Hindi, Kannada and
 * Malayalam. The nearest come first: Bengaluru and its areas, then Karnataka and Kerala,
 * then the big cities and best-known buildings.
 */
const PLACES: [en: string, hi: string, kn: string, ml: string][] = [
  ['Bengaluru', 'बेंगलुरु', 'ಬೆಂಗಳೂರು', 'ബെംഗളൂരു'],
  ['Vidhana Soudha', 'विधान सौधा', 'ವಿಧಾನಸೌಧ', 'വിധാന സൗധ'],
  ['Koramangala', 'कोरमंगला', 'ಕೋರಮಂಗಲ', 'കോറമംഗല'],
  ['Indiranagar', 'इंदिरानगर', 'ಇಂದಿರಾನಗರ', 'ഇന്ദിരാനഗർ'],
  ['Whitefield', 'व्हाइटफील्ड', 'ವೈಟ್‌ಫೀಲ್ಡ್', 'വൈറ്റ്ഫീൽഡ്'],
  ['Brookefield', 'ब्रुकफील्ड', 'ಬ್ರೂಕ್‌ಫೀಲ್ಡ್', 'ബ്രൂക്ക്ഫീൽഡ്'],
  ['Kundalahalli', 'कुंदलहल्ली', 'ಕುಂದಲಹಳ್ಳಿ', 'കുന്ദലഹള്ളി'],
  ['Udupi', 'उडुपी', 'ಉಡುಪಿ', 'ഉഡുപ്പി'],
  ['Mysuru', 'मैसूरु', 'ಮೈಸೂರು', 'മൈസൂരു'],
  ['Mangaluru', 'मंगलुरु', 'ಮಂಗಳೂರು', 'മംഗളൂരു'],
  ['Tumakuru', 'तुमकुरु', 'ತುಮಕೂರು', 'തുമകൂരു'],
  ['Kochi', 'कोच्चि', 'ಕೊಚ್ಚಿ', 'കൊച്ചി'],
  ['Lulu Mall', 'लुलु मॉल', 'ಲುಲು ಮಾಲ್', 'ലുലു മാൾ'],
  ['Thiruvananthapuram', 'तिरुवनंतपुरम', 'ತಿರುವನಂತಪುರಂ', 'തിരുവനന്തപുരം'],
  ['Hubballi', 'हुब्बल्ली', 'ಹುಬ್ಬಳ್ಳಿ', 'ഹുബ്ബള്ളി'],
  ['Belagavi', 'बेलगावी', 'ಬೆಳಗಾವಿ', 'ബെളഗാവി'],
  ['Kozhikode', 'कोझिकोड', 'ಕೋಝಿಕೋಡ್', 'കോഴിക്കോട്'],
  ['Mysore Palace', 'मैसूर पैलेस', 'ಮೈಸೂರು ಅರಮನೆ', 'മൈസൂർ കൊട്ടാരം'],
  ['Marathahalli', 'मारतहल्ली', 'ಮಾರತ್ತಹಳ್ಳಿ', 'മാരത്തഹള്ളി'],
  ['Electronic City', 'इलेक्ट्रॉनिक सिटी', 'ಎಲೆಕ್ಟ್ರಾನಿಕ್ ಸಿಟಿ', 'ഇലക്ട്രോണിക് സിറ്റി'],
  ['Jayanagar', 'जयनगर', 'ಜಯನಗರ', 'ജയനഗർ'],
  ['Malleshwaram', 'मल्लेश्वरम', 'ಮಲ್ಲೇಶ್ವರಂ', 'മല്ലേശ്വരം'],
  ['Hebbal', 'हेब्बाल', 'ಹೆಬ್ಬಾಳ', 'ഹെബ്ബാൾ'],
  ['Yelahanka', 'येलहंका', 'ಯಲಹಂಕ', 'യെലഹങ്ക'],
  ['Shivamogga', 'शिवमोग्गा', 'ಶಿವಮೊಗ್ಗ', 'ശിവമൊഗ്ഗ'],
  ['Thrissur', 'त्रिशूर', 'ತ್ರಿಶೂರ್', 'തൃശ്ശൂർ'],
  ['Kannur', 'कन्नूर', 'ಕಣ್ಣೂರು', 'കണ്ണൂർ'],
  ['Palakkad', 'पालक्काड', 'ಪಾಲಕ್ಕಾಡ್', 'പാലക്കാട്'],
  ['Chennai', 'चेन्नई', 'ಚೆನ್ನೈ', 'ചെന്നൈ'],
  ['Coimbatore', 'कोयंबटूर', 'ಕೊಯಮತ್ತೂರು', 'കോയമ്പത്തൂർ'],
  ['Hyderabad', 'हैदराबाद', 'ಹೈದರಾಬಾದ್', 'ഹൈദരാബാദ്'],
  ['Mumbai', 'मुंबई', 'ಮುಂಬೈ', 'മുംബൈ'],
  ['Pune', 'पुणे', 'ಪುಣೆ', 'പൂനെ'],
  ['Delhi', 'दिल्ली', 'ದೆಹಲಿ', 'ഡൽഹി'],
  ['Kolkata', 'कोलकाता', 'ಕೋಲ್ಕತ್ತಾ', 'കൊൽക്കത്ത'],
  ['Ahmedabad', 'अहमदाबाद', 'ಅಹಮದಾಬಾದ್', 'അഹമ്മദാബാദ്'],
  ['Jaipur', 'जयपुर', 'ಜೈಪುರ', 'ജയ്പൂർ'],
  ['Lucknow', 'लखनऊ', 'ಲಕ್ನೋ', 'ലഖ്‌നൗ'],
  ['Taj Mahal', 'ताज महल', 'ತಾಜ್ ಮಹಲ್', 'താജ് മഹൽ'],
  ['Charminar', 'चारमीनार', 'ಚಾರ್ಮಿನಾರ್', 'ചാർമിനാർ'],
];

/** More names, in English letters only. They fill whatever room is left, in this order. */
const MORE_PLACES = [
  // Around the hall, and the hall itself.
  'Polaris School of Technology', 'ITPL', 'Manyata Tech Park', 'Bellandur', 'Sarjapur', 'HSR Layout', 'BTM Layout', 'KR Puram', 'Banashankari', 'Rajajinagar',
  'Basavanagudi', 'Yeshwanthpur', 'Majestic', 'Cubbon Park', 'Lalbagh', 'Chinnaswamy Stadium', 'Bangalore Palace', 'Phoenix Marketcity', 'Forum Mall', 'Orion Mall',
  // Names people still say.
  'Bangalore', 'Mysore', 'Mangalore', 'Tumkur', 'Hubli', 'Belgaum', 'Shimoga', 'Trivandrum', 'Cochin', 'Calicut',
  // Karnataka and Kerala towns.
  'Manipal', 'Kundapura', 'Karkala', 'Davanagere', 'Ballari', 'Kalaburagi', 'Vijayapura', 'Hassan', 'Mandya', 'Chikkamagaluru',
  'Madikeri', 'Ernakulam', 'Kollam', 'Alappuzha', 'Kottayam', 'Malappuram', 'Kasaragod', 'Wayanad',
  // The rest of the country.
  'Visakhapatnam', 'Vijayawada', 'Madurai', 'Nagpur', 'Nashik', 'Surat', 'Vadodara', 'Gurugram', 'Noida', 'Chandigarh',
  'Bhubaneswar', 'Guwahati', 'Bhopal', 'Indore', 'Varanasi', 'Gateway of India', 'India Gate', 'Qutub Minar', 'Golden Temple',
];

const own = { en: 0, hi: 1, kn: 2, ml: 3 } as const;
/** Which column holds a language's own spelling. None for a language added since (Tamil, Telugu): its names go in English letters. */
const column = (lang: Lang): number | undefined => (own as Partial<Record<Lang, number>>)[lang];

/**
 * The keywords for a conversation in one language, the likeliest first: 30 unless more are asked for.
 * `known` is what this conversation has already named, such as "Brahmagiri, Udupi".
 */
export function hotwords(lang: Lang, known: (string | undefined)[] = [], most: number = SAFE_HOTWORDS): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (word?: string) => {
    const w = word?.trim();
    // Agora's advice: no short words. A two-letter keyword would be heard everywhere.
    if (!w || w.length < 3 || out.length >= Math.min(most, MOST_HOTWORDS) || seen.has(w.toLowerCase())) return;
    seen.add(w.toLowerCase());
    out.push(w);
  };
  for (const name of known) for (const part of (name ?? '').split(',')) add(part);
  TRADE.forEach(add);
  for (const row of PLACES) {
    add(row[0]);
    const c = column(lang);
    if (lang !== 'en' && c !== undefined) add(row[c]);
  }
  MORE_PLACES.forEach(add);
  return out;
}

/**
 * The same idea for Deepgram, which calls them keyterms and does best with 20 to 50 of them.
 * It listens in one language at a time, so the names are given as that language writes them.
 */
export function keyterms(lang: Lang, known: (string | undefined)[] = []): string[] {
  const names = hotwords('en', known, 44);
  const c = column(lang);
  if (lang === 'en' || c === undefined) return names;
  const inOwnScript = new Map(PLACES.map((row) => [row[0], row[c]]));
  return names.map((name) => inOwnScript.get(name) ?? name);
}
