/**
 * Turning a recurring interval into clock times, and reading one back out.
 *
 * A routine is stored as a list of `HH:MM` strings — the scheduler matches the
 * wall clock against them and knows nothing about intervals. So "every 30 minutes
 * from 09:00 to 18:00" has to be expanded on the way in, and **inferred on the way
 * out**, or the edit form cannot show what a routine actually does.
 *
 * Inferring it was the missing half. `openEditForm` restored the times, the start
 * and the end, and left the interval selector at its default of 30 minutes — so a
 * routine genuinely running every 15 minutes opened with "Every 30m" highlighted
 * and a summary reading *"37 times every 30 minutes between 9:00 AM and 6:00 PM"*,
 * which is not merely wrong but impossible: 37 half-hour steps span eighteen and a
 * half hours.
 *
 * The display was the smaller half of the damage. Editing the start or end time
 * regenerates the whole list using whatever the selector says, so changing the
 * window by one character silently rewrote a 15-minute routine to 30-minute — a
 * schedule the user never chose, in a feature whose entire job is to interrupt
 * them on a cadence they did choose.
 *
 * Pure and separate from the component so both directions are testable without
 * React.
 */

/** `HH:MM` to minutes since midnight. */
export function parseMins(value: string): number {
  if (!value) return 0;
  const parts = value.split(':');
  return parseInt(parts[0] ?? '0', 10) * 60 + parseInt(parts[1] ?? '0', 10);
}

function formatMins(totalMins: number): string {
  const h = Math.floor(totalMins / 60) % 24;
  const m = totalMins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Every clock time at `intervalMinutes` steps across the window, inclusive. */
export function generateIntervalTimes(
  intervalMinutes: number,
  start24 = '09:00',
  end24 = '18:00',
): string[] {
  const startMins = parseMins(start24);
  let endMins = parseMins(end24);
  // A window ending before it starts runs past midnight.
  if (endMins <= startMins) endMins += 24 * 60;

  const result: string[] = [];
  const step = Math.max(1, intervalMinutes);
  for (let current = startMins; current <= endMins; current += step) {
    result.push(formatMins(current));
  }
  return Array.from(new Set(result)).sort();
}

/**
 * The interval a stored list of times was built from, or null.
 *
 * Null rather than a guess when the times are not evenly spaced: a routine at
 * 09:00, 12:30 and 17:00 was not built from an interval, and answering "every 210
 * minutes" would put a number on screen that nobody chose. The caller shows the
 * real times instead.
 */
export function deriveIntervalMinutes(times: readonly string[]): number | null {
  if (times.length < 2) return null;

  const sorted = [...times].sort();
  const first = parseMins(sorted[0]!);
  const second = parseMins(sorted[1]!);
  const step = second - first;
  if (step <= 0) return null;

  for (let i = 1; i < sorted.length; i += 1) {
    if (parseMins(sorted[i]!) - parseMins(sorted[i - 1]!) !== step) return null;
  }
  return step;
}

/**
 * What the schedule actually is, in a sentence, derived only from the times.
 *
 * Takes no interval argument on purpose. The summary that was wrong read its
 * count from the stored times and its interval from the selector, so the two
 * halves could disagree and the sentence describe a schedule that existed
 * nowhere. One source cannot contradict itself.
 */
export function describeIntervalSchedule(times: readonly string[]): string {
  if (times.length === 0) return 'No times set yet.';
  if (times.length === 1) return `Once a day, at ${times[0]}.`;

  const sorted = [...times].sort();
  const step = deriveIntervalMinutes(sorted);
  const from = sorted[0]!;
  const to = sorted[sorted.length - 1]!;

  if (step === null) {
    return `${sorted.length} reminders a day, between ${from} and ${to}.`;
  }

  const every = step % 60 === 0 ? `${step / 60}h` : `${step}m`;
  return `${sorted.length} reminders a day, every ${every} between ${from} and ${to}.`;
}
