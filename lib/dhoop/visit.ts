/**
 * A booked site visit as something the person keeps: a calendar entry with a reminder.
 *
 * Dhoop used to say "a reminder will come the day before" when it booked a visit, and nothing
 * was ever sent: a promise with nothing behind it. Now the day and the time that were spoken
 * are read into a real moment, and the visit is offered as a calendar file. Once it is in the
 * person's own calendar, the reminder is the calendar's to give, and it does come.
 *
 * Days and times arrive as people say them ("Saturday", "22 November", "tomorrow", "10 am",
 * "evening"). When they cannot be read with confidence there is no calendar entry, and Dhoop
 * says only that the visit is noted.
 *
 * Safe to import from a screen: plain sums over dates.
 */

const IST_MINUTES = 330;
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** The hour and minute a spoken time means, on a 24-hour clock. A bare "4" for a visit is the afternoon. */
export function timeSaid(said: string): { hour: number; minute: number } | null {
  // "5.30 pm" is half past five, and "p.m." is pm.
  const t = said.toLowerCase().replace(/(\d)\.(\d{2})/, '$1:$2').replace(/\./g, '').trim();
  if (/\bnoon\b/.test(t)) return { hour: 12, minute: 0 };
  if (/\bmorning\b/.test(t) && !/\d/.test(t)) return { hour: 10, minute: 0 };
  if (/\bafternoon\b/.test(t) && !/\d/.test(t)) return { hour: 15, minute: 0 };
  if (/\bevening\b/.test(t) && !/\d/.test(t)) return { hour: 17, minute: 0 };
  const m = t.match(/(\d{1,2})(?:[:\s](\d{2}))?\s*(am|pm)?/);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  if (hour > 23 || minute > 59) return null;
  const half = m[3] ?? (/\b(morning)\b/.test(t) ? 'am' : /\b(afternoon|evening|night)\b/.test(t) ? 'pm' : undefined);
  if (half === 'pm' && hour < 12) hour += 12;
  else if (half === 'am' && hour === 12) hour = 0;
  else if (!half && hour >= 1 && hour <= 7) hour += 12;
  return { hour, minute };
}

/**
 * The moment a spoken day and time mean, counted in Indian time from `now`. Null when the day
 * or the time cannot be read, or the moment has already gone.
 */
export function whenIs(day: string, time: string, now: Date): Date | null {
  const clock = timeSaid(time);
  if (!clock) return null;
  // Today's date as the calendar on an Indian wall shows it.
  const here = new Date(now.getTime() + IST_MINUTES * 60_000);
  const today = Date.UTC(here.getUTCFullYear(), here.getUTCMonth(), here.getUTCDate());
  const d = day.toLowerCase().replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();
  let date: number | null = null;
  const weekday = WEEKDAYS.findIndex((w) => new RegExp(`\\b${w.slice(0, 3)}(${w.slice(3)})?\\b`).test(d));
  const month = MONTHS.findIndex((m) => new RegExp(`\\b${m.slice(0, 3)}(${m.slice(3)})?\\b`).test(d));
  const number = d.match(/\b(\d{1,2})(?:st|nd|rd|th)?\b/);
  if (/day after tomorrow/.test(d)) date = today + 2 * 86_400_000;
  else if (/\btomorrow\b/.test(d)) date = today + 86_400_000;
  else if (/\btoday\b/.test(d)) date = today;
  else if (month >= 0 && number) {
    const year = here.getUTCFullYear();
    date = Date.UTC(year, month, Number(number[1]));
    // "5 January" said in November is next January.
    if (date < today - 86_400_000) date = Date.UTC(year + 1, month, Number(number[1]));
  } else if (weekday >= 0) {
    const ahead = (weekday - new Date(today).getUTCDay() + 7) % 7 || 7;
    date = today + ahead * 86_400_000;
  }
  if (date === null) return null;
  const start = new Date(date + (clock.hour * 60 + clock.minute - IST_MINUTES) * 60_000);
  return start.getTime() > now.getTime() - 60 * 60_000 ? start : null;
}

/** "Saturday 21 November, 10 am": the moment as it is said in India. */
export function visitSaid(start: Date): string {
  const day = start.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' }).replace(',', '');
  const time = start.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }).replace(':00', '').toLowerCase();
  return `${day}, ${time}`;
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const text = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');

/** The visit as a calendar file any phone or laptop will take: an hour long, with a reminder the day before. */
export function visitCalendar(visit: { id: string; installer: string; start: Date; passbookUrl?: string; made?: Date }): string {
  const end = new Date(visit.start.getTime() + 60 * 60_000);
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Dhoop//Solar site visit//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${visit.id}@dhoop`,
    `DTSTAMP:${stamp(visit.made ?? new Date())}`,
    `DTSTART:${stamp(visit.start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${text(`Solar site visit: ${visit.installer}`)}`,
    `DESCRIPTION:${text(`Booked with Dhoop. Keep your latest electricity bill ready, and show the installer the roof.${visit.passbookUrl ? `\nYour plan: ${visit.passbookUrl}` : ''}`)}`,
    'BEGIN:VALARM',
    'TRIGGER:-P1D',
    'ACTION:DISPLAY',
    `DESCRIPTION:${text(`Solar site visit tomorrow: ${visit.installer}`)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}
