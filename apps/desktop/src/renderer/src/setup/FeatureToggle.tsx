import { useId, useState, type JSX } from 'react';
import { Icon, type IconName } from './icons.js';

/**
 * One opt-in feature on the Personalize step of first run.
 *
 * **The whole card is the control.** It replaces a `<div onClick>` wrapped
 * around a native `<input type="checkbox">`, which was wrong three ways at once:
 * a div is not reachable by keyboard and announces nothing to a screen reader;
 * the checkbox inside it was inert, since its `onChange` was a no-op and the
 * div's click did the real work; and it rendered as the operating system's own
 * square — flat, grey, sized by the OS — so it read as a control belonging to
 * some other application that happened to be sitting inside this one.
 *
 * One `<button role="checkbox">`, one tick drawn by us. Space and Enter both
 * work without any key handling of our own, and the description is bound with
 * `aria-describedby` so it is read out as part of the option rather than as
 * loose text floating after it.
 *
 * Compare `Tick.tsx`, which faced the same native-checkbox problem and resolved
 * it the other way: ticking a reply is one-way, so there is no checked state to
 * render and a plain button is the honest control. These options are genuinely
 * two-state, so this one keeps checkbox semantics.
 *
 * The focus ring is gated on `:focus-visible` rather than on focus, or every
 * mouse click would leave a ring behind on a card the pointer has already left.
 */
export function FeatureToggle({
  icon,
  title,
  description,
  recommended = false,
  checked,
  onToggle,
}: {
  icon: IconName;
  title: string;
  description: string;
  /** Rendered as a badge beside the title, not as "(Recommended)" inside it. */
  recommended?: boolean;
  checked: boolean;
  onToggle: () => void;
}): JSX.Element {
  const descriptionId = useId();
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-describedby={descriptionId}
      onClick={onToggle}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={(e) => setFocus(e.currentTarget.matches(':focus-visible'))}
      onBlur={() => setFocus(false)}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 13,
        width: '100%',
        padding: '14px 16px',
        borderRadius: 12,
        textAlign: 'left',
        font: 'inherit',
        background: checked
          ? 'rgba(242, 166, 179, 0.07)'
          : hover
            ? 'rgba(255, 255, 255, 0.04)'
            : '#241f2b',
        border: `1px solid ${
          checked ? 'rgba(242, 166, 179, 0.32)' : hover ? '#453a50' : '#332c3d'
        }`,
        boxShadow: focus ? '0 0 0 3px rgba(242, 166, 179, 0.28)' : 'none',
        cursor: 'pointer',
        outline: 'none',
        transition: 'background 160ms ease, border-color 160ms ease, box-shadow 160ms ease',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 18,
          height: 18,
          flexShrink: 0,
          marginTop: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 5,
          border: `1.5px solid ${checked ? 'transparent' : hover ? '#5a4c66' : '#463b52'}`,
          background: checked ? 'linear-gradient(135deg, #f2a6b3, #e58597)' : 'transparent',
          transition: 'background 160ms ease, border-color 160ms ease',
        }}
      >
        <svg
          width={12}
          height={12}
          viewBox="0 0 24 24"
          fill="none"
          stroke="#2a1f30"
          strokeWidth={3.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            opacity: checked ? 1 : 0,
            transform: checked ? 'scale(1)' : 'scale(0.55)',
            transition: 'opacity 160ms ease, transform 160ms cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          <polyline points="4 12.5 9.5 18 20 6.5" />
        </svg>
      </span>

      <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name={icon} size={15} color={checked ? '#f2a6b3' : '#8d7f98'} />
          <span style={{ fontSize: 13.5, fontWeight: 650, color: '#f4eef6' }}>{title}</span>
          {recommended && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                padding: '2.5px 7px',
                borderRadius: 999,
                color: '#f2a6b3',
                background: 'rgba(242, 166, 179, 0.13)',
                border: '1px solid rgba(242, 166, 179, 0.2)',
              }}
            >
              Recommended
            </span>
          )}
        </span>
        <span id={descriptionId} style={{ fontSize: 12, color: '#a79ab2', lineHeight: 1.45 }}>
          {description}
        </span>
      </span>
    </button>
  );
}
