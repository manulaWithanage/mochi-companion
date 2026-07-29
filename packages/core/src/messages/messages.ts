/**
 * What Mochi says.
 *
 * Templated, not generated. V1 ships no LLM — and even in V2 the LLM only
 * decides *wording*, never whether or when to speak. Keeping the catalogue
 * here as pure functions means the phrasing is testable, costs nothing, and
 * works with no API key.
 *
 * Every message here is a response to something the user did. Unprompted
 * messages must go through the interruption governor (Phase 1.5) and do not
 * belong in this file.
 */

import { formatDuration } from '../timer/session.js';

export type MessageKind =
  | 'welcome'
  | 'greeting'
  | 'timer-started'
  | 'timer-stopped'
  | 'timer-stopped-brief';

export interface MessageContext {
  readonly assistantName: string;
  readonly now: Date;
  readonly durationMs?: number;
  /** Injectable so tests are deterministic. */
  readonly random?: () => number;
}

/** How long a bubble stays up before dismissing itself. */
export const BUBBLE_TTL_MS = 4200;
export const BUBBLE_TTL_LONG_MS = 6000;

/** Anything under this is a misclick, not a work session. */
export const BRIEF_SESSION_MS = 10_000;

type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

export function timeOfDay(now: Date): TimeOfDay {
  const h = now.getHours();
  if (h < 5) return 'night';
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  if (h < 22) return 'evening';
  return 'night';
}

const GREETINGS: Record<TimeOfDay, readonly string[]> = {
  morning: ['Good morning!', 'Morning! Ready when you are.', "Morning — let's have a good one."],
  afternoon: ['Afternoon!', 'Hey there.', 'Afternoon — how’s it going?'],
  evening: ['Evening!', 'Evening — still going?', 'Hey, good evening.'],
  night: ['Still up?', 'Late one tonight?', 'Working late — I’ll keep you company.'],
};

const STARTED: readonly string[] = [
  'Timer running — off we go!',
  'On it. Tracking now.',
  'Let’s get into it.',
  'Clock’s running. Focus mode!',
];

const STOPPED_SUFFIX: readonly string[] = [
  'Nice work.',
  'Well done!',
  'That counts.',
  'Good session.',
];

/** Deterministic pick when `random` is supplied; otherwise Math.random. */
function pick(options: readonly string[], random?: () => number): string {
  if (options.length === 0) return '';
  const r = random === undefined ? Math.random() : random();
  const index = Math.min(options.length - 1, Math.max(0, Math.floor(r * options.length)));
  return options[index]!;
}

export function composeMessage(kind: MessageKind, ctx: MessageContext): string {
  switch (kind) {
    case 'welcome':
      return `Hi! I’m ${ctx.assistantName}. Click me to start tracking.`;

    case 'greeting':
      return pick(GREETINGS[timeOfDay(ctx.now)], ctx.random);

    case 'timer-started':
      return pick(STARTED, ctx.random);

    case 'timer-stopped-brief':
      // Too short to congratulate — acknowledging it would feel hollow.
      return 'Stopped.';

    case 'timer-stopped': {
      const duration = formatDuration(ctx.durationMs ?? 0);
      return `${duration} tracked. ${pick(STOPPED_SUFFIX, ctx.random)}`;
    }
  }
}

/** Bubbles carrying a duration are worth reading slowly. */
export function ttlFor(kind: MessageKind): number {
  return kind === 'timer-stopped' || kind === 'welcome' ? BUBBLE_TTL_LONG_MS : BUBBLE_TTL_MS;
}
