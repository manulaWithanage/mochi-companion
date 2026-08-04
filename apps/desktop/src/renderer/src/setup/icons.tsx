import type { JSX } from 'react';

/**
 * The small vector set, in the same language as the nav icons in Dashboard.
 *
 * Stroked 24×24 outlines rather than emoji. Emoji render as whatever the OS ships
 * — different metrics, different colour, different weight per platform — so a row
 * of them never aligns and never matches the rest of the UI. These inherit
 * `currentColor` and line up with the text beside them.
 *
 * A shared module because these are now wanted in more than one place, and a
 * third copy of inline SVG is how two of them quietly drift apart.
 */

export type IconName =
  'target' | 'stopwatch' | 'droplet' | 'sparkle' | 'clock' | 'hand' | 'question' | 'thread';

const PATHS: Readonly<Record<IconName, JSX.Element>> = {
  /** Priorities: what to aim at. */
  target: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.4" />
    </>
  ),
  /** Time tracking. */
  stopwatch: (
    <>
      <line x1="10" x2="14" y1="2.5" y2="2.5" />
      <line x1="12" x2="12" y1="14" y2="10.5" />
      <circle cx="12" cy="14" r="8" />
    </>
  ),
  /** Wellness routines: water, breaks. */
  droplet: <path d="M12 2.7 6.9 8.2a7 7 0 1 0 10.2 0Z" />,
  /** Anything model-assisted. */
  sparkle: (
    <>
      <path d="M12 3.2 13.6 8 18.4 9.6 13.6 11.2 12 16 10.4 11.2 5.6 9.6 10.4 8Z" />
      <path d="M18 15.5 18.7 17.3 20.5 18 18.7 18.7 18 20.5 17.3 18.7 15.5 18 17.3 17.3Z" />
    </>
  ),
  /** A deadline. */
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 16 14" />
    </>
  ),
  /** Someone wants a decision. */
  hand: (
    <>
      <path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11" />
      <path d="M12 11V4.8a1.5 1.5 0 0 1 3 0V11" />
      <path d="M15 11V6.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-1a7 7 0 0 1-7-7v-2a1.5 1.5 0 0 1 3 0" />
    </>
  ),
  /** Someone wants an answer. */
  question: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.6 9.3a2.5 2.5 0 0 1 4.9.7c0 1.7-2.5 2.5-2.5 2.5" />
      <line x1="12" x2="12" y1="16.5" y2="16.6" />
    </>
  ),
  /** An ongoing conversation. */
  thread: (
    <>
      <path d="M20 11.5a7.5 7.5 0 0 1-10.9 6.7L4 19.5l1.4-4.4A7.5 7.5 0 1 1 20 11.5Z" />
      <line x1="9" x2="15" y1="10" y2="10" />
      <line x1="9" x2="13" y1="13.5" y2="13.5" />
    </>
  ),
};

export function Icon({
  name,
  size = 16,
  color,
  filled = false,
}: {
  name: IconName;
  size?: number;
  color?: string;
  /** `sparkle` reads better solid; outlines suit the rest. */
  filled?: boolean;
}): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? (color ?? 'currentColor') : 'none'}
      stroke={color ?? 'currentColor'}
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      {PATHS[name]}
    </svg>
  );
}
