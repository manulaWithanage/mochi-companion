/**
 * Reading a date and a time out of what someone typed.
 *
 * "Call the dentist tomorrow 3pm" should not require touching a date picker, a
 * time picker and a title field. The fastest control is the one the cursor is
 * already in, so the composer parses trailing date phrases out of the title
 * and shows what it understood.
 *
 * Two rules keep this from becoming a guessing game:
 *
 *  1. It only ever matches at the **end** of the text. "Meet Tuesday's client"
 *     keeps its Tuesday; "Meet client Tuesday" does not. Matching anywhere
 *     would quietly eat words out of the middle of a title.
 *
 *  2. Everything it matched is returned in `matched`, so the UI can show it
 *     back and offer to undo it. A parser that silently rewrites your input is
 *     worse than no parser.
 */

import { taskDay } from './tasks.js';

export interface ParsedWhen {
  /** The title with the recognised phrase removed. */
  readonly title: string;
  /** Local `YYYY-MM-DD`, or null when the phrase meant "someday". */
  readonly dueOn: string | null;
  /** Epoch ms when a time was given, otherwise null. */
  readonly remindAt: number | null;
  /** Exactly what was consumed. Empty when nothing was recognised. */
  readonly matched: string;
}

const NOTHING = (text: string): ParsedWhen => ({
  title: text.trim(),
  dueOn: null,
  remindAt: null,
  matched: '',
});

/** Monday-first names, longest forms first so "thur" wins before "thu". */
const WEEKDAYS: readonly { readonly names: readonly string[]; readonly index: number }[] = [
  { names: ['sunday', 'sun'], index: 0 },
  { names: ['monday', 'mon'], index: 1 },
  { names: ['tuesday', 'tues', 'tue'], index: 2 },
  { names: ['wednesday', 'weds', 'wed'], index: 3 },
  { names: ['thursday', 'thurs', 'thur', 'thu'], index: 4 },
  { names: ['friday', 'fri'], index: 5 },
  { names: ['saturday', 'sat'], index: 6 },
];

const UNIT_MS: Readonly<Record<string, number>> = {
  m: 60_000,
  min: 60_000,
  mins: 60_000,
  minute: 60_000,
  minutes: 60_000,
  h: 3_600_000,
  hr: 3_600_000,
  hrs: 3_600_000,
  hour: 3_600_000,
  hours: 3_600_000,
  d: 86_400_000,
  day: 86_400_000,
  days: 86_400_000,
  w: 604_800_000,
  week: 604_800_000,
  weeks: 604_800_000,
};

/** `3pm`, `3:30pm`, `15:00`, `at 9`. Anchored to the end. */
const TIME_AT_END = /\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i;

/** `in 20 min`, `in 2 hours`, `in 3 days`. Anchored to the end. */
const RELATIVE_AT_END = /\s+in\s+(\d{1,3})\s*([a-z]+)$/i;

/** `today`, `tonight`, `tomorrow`, `someday`, `next week`, `friday`, `next friday`. */
function matchDayPhrase(
  text: string,
  now: Date,
): { dueOn: string | null; consumed: string } | null {
  const lower = text.toLowerCase();

  const simple: readonly { readonly phrase: string; readonly addDays: number | null }[] = [
    { phrase: 'someday', addDays: null },
    { phrase: 'next week', addDays: 7 },
    { phrase: 'tomorrow', addDays: 1 },
    { phrase: 'tmr', addDays: 1 },
    { phrase: 'tonight', addDays: 0 },
    { phrase: 'today', addDays: 0 },
  ];

  for (const entry of simple) {
    if (lower.endsWith(` ${entry.phrase}`) || lower === entry.phrase) {
      const consumed = text.slice(text.length - entry.phrase.length);
      if (entry.addDays === null) return { dueOn: null, consumed };
      const day = new Date(now);
      day.setDate(day.getDate() + entry.addDays);
      return { dueOn: taskDay(day), consumed };
    }
  }

  for (const weekday of WEEKDAYS) {
    for (const name of weekday.names) {
      const withNext = `next ${name}`;
      const hit = lower.endsWith(` ${withNext}`) || lower === withNext ? withNext : null;
      const bare = lower.endsWith(` ${name}`) || lower === name ? name : null;
      const phrase = hit ?? bare;
      if (phrase === null) continue;

      // Always the next one that has not happened yet; "next friday" on a
      // Friday means the Friday after, not today.
      const day = new Date(now);
      const forward = (weekday.index - day.getDay() + 7) % 7;
      const skipToNextWeek = hit !== null || forward === 0;
      day.setDate(day.getDate() + (skipToNextWeek ? forward + 7 : forward));

      return { dueOn: taskDay(day), consumed: text.slice(text.length - phrase.length) };
    }
  }

  return null;
}

/**
 * Pull a date and time off the end of `text`.
 *
 * Returns `matched: ''` and the untouched title when nothing is recognised, so
 * the caller can fall back to whatever its own pickers say.
 */
export function parseWhen(text: string, now: Date): ParsedWhen {
  const trimmed = text.trim();
  if (trimmed.length === 0) return NOTHING(text);

  // "in 20 min" is self-contained: it fixes both the day and the moment.
  const relative = RELATIVE_AT_END.exec(trimmed);
  if (relative !== null) {
    const amount = Number(relative[1]);
    const unit = UNIT_MS[relative[2]!.toLowerCase()];
    if (unit !== undefined && amount > 0) {
      const at = new Date(now.getTime() + amount * unit);
      const title = trimmed.slice(0, relative.index).trim();
      // A bare "in 5 minutes" with nothing else is a time, not a task.
      if (title.length > 0) {
        return { title, dueOn: taskDay(at), remindAt: at.getTime(), matched: relative[0]!.trim() };
      }
    }
  }

  let rest = trimmed;
  let matched = '';

  // Time first, because it sits after the day: "tomorrow 3pm".
  let hours: number | null = null;
  let minutes = 0;
  const time = TIME_AT_END.exec(rest);
  if (time !== null) {
    const rawHour = Number(time[1]);
    const rawMinute = time[2] === undefined ? 0 : Number(time[2]);
    const meridiem = time[3]?.toLowerCase();
    const plausible =
      rawMinute < 60 &&
      (meridiem === undefined ? rawHour < 24 : rawHour >= 1 && rawHour <= 12) &&
      // A bare number with no colon and no am/pm is far more likely to be part
      // of the task ("buy 2 tickets") than a time.
      (meridiem !== undefined || time[2] !== undefined);

    if (plausible) {
      hours = rawHour;
      if (meridiem === 'pm' && rawHour < 12) hours += 12;
      if (meridiem === 'am' && rawHour === 12) hours = 0;
      minutes = rawMinute;
      matched = time[0]!.trim();
      rest = rest.slice(0, time.index).trim();
    }
  }

  const day = matchDayPhrase(rest, now);
  if (day !== null) {
    matched = matched.length > 0 ? `${day.consumed.trim()} ${matched}` : day.consumed.trim();
    rest = rest.slice(0, rest.length - day.consumed.length).trim();
  }

  if (matched.length === 0 || rest.length === 0) return NOTHING(text);

  // A time with no day means the next time that clock reading comes round.
  let dueOn = day === null ? taskDay(now) : day.dueOn;
  let remindAt: number | null = null;

  if (hours !== null && dueOn !== null) {
    const parts = dueOn.split('-');
    const at = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    at.setHours(hours, minutes, 0, 0);
    if (day === null && at.getTime() <= now.getTime()) {
      // "9am" typed at 3pm means tomorrow morning, not this morning.
      at.setDate(at.getDate() + 1);
      dueOn = taskDay(at);
    }
    remindAt = at.getTime();
  }

  return { title: rest, dueOn, remindAt, matched };
}

/** `tomorrow at 15:00`, `Fri`, `someday` — what the parser understood. */
export function describeWhen(parsed: ParsedWhen, now: Date): string {
  if (parsed.matched.length === 0) return '';
  if (parsed.dueOn === null) return 'someday';

  const today = taskDay(now);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const dayLabel =
    parsed.dueOn === today
      ? 'today'
      : parsed.dueOn === taskDay(tomorrow)
        ? 'tomorrow'
        : (() => {
            const parts = parsed.dueOn.split('-');
            const at = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
            return at.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
          })();

  if (parsed.remindAt === null) return dayLabel;

  const clock = new Date(parsed.remindAt).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${dayLabel} at ${clock}`;
}
