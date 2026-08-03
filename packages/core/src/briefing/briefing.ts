/**
 * The morning briefing.
 *
 * The demo the project has been building toward: at the start of the working
 * day Mochi appears centre screen and says what the day looks like.
 *
 * **Structured, not a string.** This produces facts; phrasing happens later.
 * That split is the same one the whole LLM layer rests on — every number here
 * is computed, so a model can only ever reword something true. A briefing that
 * invents a meeting is worse than no briefing, because the one time it matters
 * the user has already stopped checking.
 *
 * Pure: no clock of its own, no I/O.
 */

import {
  clockLabel,
  conflicts,
  dayShape,
  eventsOnDay,
  freeBlocks,
  isBusy,
  upcoming,
  workWindow,
  type CalendarEvent,
  type Interval,
} from '../calendar/calendar.js';
import type { WorkHours } from '../mascot/state.js';
import { dueToday, overdue, type Task } from '../tasks/tasks.js';

export const BRIEFING_SUBJECT = 'briefing:morning';

/** A single stated fact. Ordered by how much it should change the user's day. */
export interface BriefingLine {
  readonly kind: 'meetings' | 'focus' | 'tasks' | 'conflict' | 'clear';
  readonly text: string;
  /** Higher is more worth saying when space is short. */
  readonly weight: number;
}

export interface Briefing {
  /** One sentence. The part that survives if nothing else is read. */
  readonly headline: string;
  readonly lines: readonly BriefingLine[];
  readonly meetingCount: number;
  readonly firstMeetingAt: number | null;
  readonly longestFreeMs: number;
  readonly openTasks: number;
  readonly overdueTasks: number;
  /** True when there is genuinely nothing to report. */
  readonly quiet: boolean;
}

export interface BriefingInput {
  readonly events: readonly CalendarEvent[];
  readonly tasks: readonly Task[];
  readonly workHours: WorkHours;
  readonly now: Date;
  /** Omitted when no calendar is connected, which changes what can be claimed. */
  readonly hasCalendar: boolean;
}

const MINUTE = 60_000;

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

function humanGap(ms: number): string {
  const minutes = Math.round(ms / MINUTE);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (rest === 0) return hours === 1 ? '1 hour' : `${hours} hours`;
  return `${hours}h ${rest}m`;
}

/**
 * Build the briefing.
 *
 * Note what it refuses to do: with no calendar connected it says nothing about
 * meetings at all, rather than reporting "no meetings today" — which would be
 * a claim it cannot support and which reads as reassuring right up until the
 * user misses something.
 */
export function composeBriefing(input: BriefingInput): Briefing {
  const { events, tasks, workHours, now, hasCalendar } = input;
  const at = now.getTime();

  const window = workWindow(now, workHours);
  const todays = hasCalendar ? eventsOnDay(events, now).filter(isBusy) : [];
  const ahead = hasCalendar ? upcoming(events, at) : [];
  const shape =
    window === null || !hasCalendar ? null : dayShape(events, window, { notBefore: at });

  const blocks: readonly Interval[] =
    window === null || !hasCalendar ? [] : freeBlocks(events, window, { notBefore: at });

  const open = dueToday(tasks, now);
  const late = overdue(tasks, now);
  const clashes = hasCalendar ? conflicts(todays) : [];

  const lines: BriefingLine[] = [];

  // Meetings first: they are the part of the day the user cannot move.
  if (hasCalendar && ahead.length > 0) {
    const first = ahead[0]!;
    lines.push({
      kind: 'meetings',
      weight: 100,
      text:
        ahead.length === 1
          ? `One meeting: ${first.title} at ${clockLabel(first.startsAt)}.`
          : `${plural(ahead.length, 'meeting')}, first is ${first.title} at ${clockLabel(first.startsAt)}.`,
    });
  }

  // A double-booking is worth more than the meeting list, because it is the
  // one thing the user has to resolve before the day starts.
  if (clashes.length > 0) {
    const [a, b] = clashes[0]!;
    lines.push({
      kind: 'conflict',
      weight: 120,
      text: `${a.title} and ${b.title} overlap at ${clockLabel(b.startsAt)}.`,
    });
  }

  if (shape !== null) {
    const longest = blocks.reduce((max, block) => Math.max(max, block.end - block.start), 0);
    if (shape.meetingCount === 0) {
      lines.push({ kind: 'focus', weight: 80, text: 'Nothing booked, the day is yours.' });
    } else if (longest > 0) {
      const best = blocks.find((block) => block.end - block.start === longest);
      lines.push({
        kind: 'focus',
        weight: 90,
        text:
          best === undefined
            ? `Longest clear stretch is ${humanGap(longest)}.`
            : `Longest clear stretch is ${humanGap(longest)} from ${clockLabel(best.start)}.`,
      });
    } else if (shape.fragmented) {
      lines.push({
        kind: 'focus',
        weight: 95,
        text: 'No clear stretch long enough for deep work today.',
      });
    }
  }

  if (late.length > 0) {
    lines.push({
      kind: 'tasks',
      weight: 85,
      text: `${plural(late.length, 'task')} carried over from before.`,
    });
  } else if (open.length > 0) {
    lines.push({
      kind: 'tasks',
      weight: 60,
      text: `${plural(open.length, 'task')} on today's list.`,
    });
  }

  const quiet = lines.length === 0;
  if (quiet) {
    lines.push({
      kind: 'clear',
      weight: 10,
      text: hasCalendar
        ? 'Nothing scheduled and nothing on the list. A rare one.'
        : 'Nothing on the list today.',
    });
  }

  const ordered = [...lines].sort((a, b) => b.weight - a.weight);

  return {
    headline: ordered[0]!.text,
    lines: ordered,
    meetingCount: todays.length,
    firstMeetingAt: ahead[0]?.startsAt ?? null,
    longestFreeMs: blocks.reduce((max, b) => Math.max(max, b.end - b.start), 0),
    openTasks: open.length,
    overdueTasks: late.length,
    quiet,
  };
}

/**
 * The briefing as one short spoken line.
 *
 * Used directly when no model is configured, and as the fallback when one is
 * but the call fails. The briefing must work with zero setup — it is the first
 * thing a new user sees it do.
 */
export function briefingText(briefing: Briefing, assistantName = 'Mochi'): string {
  void assistantName;
  // Two facts at most. A speech bubble is not a report, and the tab holds the
  // rest for anyone who wants it.
  return briefing.lines
    .slice(0, 2)
    .map((line) => line.text)
    .join(' ');
}

/**
 * Prompt for a model to reword the briefing.
 *
 * The facts are handed over already computed and the model is told plainly not
 * to add any. This is the same contract as everywhere else in the app: the
 * model chooses words, never content.
 */
export function briefingPrompt(briefing: Briefing, userName?: string): string {
  const facts = briefing.lines.map((line) => `- ${line.text}`).join('\n');
  const who = userName !== undefined && userName.length > 0 ? ` The user is ${userName}.` : '';

  return [
    `Rewrite these facts as one warm, natural greeting of at most two short sentences.${who}`,
    'Do not add any fact that is not listed. Do not invent meetings, times or numbers.',
    'No bullet points, no preamble, no sign-off.',
    '',
    facts,
  ].join('\n');
}

/**
 * When the briefing should fire today.
 *
 * At the start of the working day, not on a fixed clock time — someone who
 * starts at 06:00 does not want it at nine. Returns null when that moment has
 * already passed, so a late start does not trigger a "morning" briefing in the
 * afternoon.
 */
export function briefingTimeToday(now: Date, workHours: WorkHours): number | null {
  const window = workWindow(now, workHours);
  if (window === null) return null;
  return window.start > now.getTime() ? window.start : null;
}
