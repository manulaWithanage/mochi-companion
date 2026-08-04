import type { JSX } from 'react';
import { C, card } from './ui.js';

/**
 * Saying "there is nothing here yet" once, and the same way everywhere.
 *
 * The Calendar tab with an empty calendar told the user they had nothing five
 * separate times: a headline, a "0" stat, a "0m" stat, an empty timeline bar and a
 * bordered "nothing scheduled this week" card — plus "Longest focus stretch
 * 8h 00m", which with no meetings is the length of the workday presented in green
 * as though it were a finding. The Time tab opened on four cards reading 0m, 0, 0m
 * and "No data yet".
 *
 * Two rules, and the second is the one that gets forgotten:
 *
 * 1. **A card that would show zero does not render.** A grid of noughts costs the
 *    same space as real numbers and carries none of the information.
 * 2. **The line that replaces it says what would appear and what makes it
 *    appear.** "No data yet" tells the user they have a problem; "start the timer
 *    and your totals appear here" tells them it is a beginning.
 *
 * A shared component because three tabs needed this and had phrased it three
 * ways — one shouting in Title Case with an exclamation mark, one a dashed box
 * with an emoji, one absent entirely.
 */
export function NothingYet({
  headline,
  detail,
}: {
  /** What is not here, as a plain sentence. Sentence case, no exclamation. */
  headline: string;
  /** What would appear here, and what causes it to. */
  detail: string;
}): JSX.Element {
  return (
    <div
      style={{
        ...card,
        borderStyle: 'dashed',
        background: 'transparent',
        textAlign: 'center',
        padding: '30px 24px',
      }}
    >
      <div style={{ fontSize: 14, color: C.text, marginBottom: 5 }}>{headline}</div>
      <div
        style={{
          fontSize: 12.5,
          color: C.dim,
          lineHeight: 1.55,
          maxWidth: 440,
          margin: '0 auto',
        }}
      >
        {detail}
      </div>
    </div>
  );
}
