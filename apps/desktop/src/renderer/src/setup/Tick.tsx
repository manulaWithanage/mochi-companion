import { useState, type JSX } from 'react';
import { C } from './ui.js';

/**
 * Finish something.
 *
 * Replaces a native `<input type="checkbox">`, which rendered as the operating
 * system's own control — a flat grey square that belonged to a different
 * application than the one around it.
 *
 * **It is a button, not a checkbox.** Both places this replaces passed
 * `checked={false}` permanently: ticking a reply marks it handled and the row
 * leaves the list; ticking a task completes it and the same happens. Nothing ever
 * rendered in a checked state, because there is no state to be in. A checkbox
 * promises a thing you can switch back, and this is a one-way action, so a button
 * with an accessible name is the honest control and keeps keyboard and screen
 * reader behaviour that a styled `<div>` would have thrown away.
 *
 * The check only appears on hover. Empty at rest it reads as "not done yet";
 * showing the mark before the press would suggest it already is.
 */
export function Tick({
  label,
  onDone,
  size = 17,
}: {
  /** What pressing this finishes. Becomes the accessible name and the tooltip. */
  label: string;
  onDone: () => void;
  size?: number;
}): JSX.Element {
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const lit = hover || focus;

  return (
    <button
      type="button"
      onClick={onDone}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      aria-label={label}
      title={label}
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        borderRadius: 6,
        border: `1.5px solid ${lit ? C.accent : C.borderStrong}`,
        background: lit ? 'rgba(242, 166, 179, 0.16)' : 'transparent',
        cursor: 'pointer',
        transition: 'border-color 140ms ease, background 140ms ease',
        outline: 'none',
      }}
    >
      <svg
        width={size - 6}
        height={size - 6}
        viewBox="0 0 24 24"
        fill="none"
        stroke={C.accent}
        strokeWidth={3.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        style={{ opacity: lit ? 1 : 0, transition: 'opacity 140ms ease' }}
      >
        <polyline points="4 12.5 9.5 18 20 6.5" />
      </svg>
    </button>
  );
}
