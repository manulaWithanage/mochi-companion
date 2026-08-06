import { useState, type JSX } from 'react';

/**
 * The second icon row: what Mochi is doing, rather than what you are doing.
 *
 * Left-click reveals the projects — the thing you touch twenty times a day.
 * Right-click reveals this one, which is Mochi's own controls. Both rows share
 * the same strip under the mascot and the same shape, so opening one replaces
 * the other rather than stacking beside it. That is deliberate: a radial menu
 * was tried here first and the thing that sank it was two controls on screen at
 * once with no answer to which a click belonged to.
 *
 * Every item is backed by a setting that already exists and is currently
 * reachable only by opening the window and finding the right tab. Two proposed
 * items were dropped rather than faked: a snooze, because there is no
 * quiet-until anywhere in the governor to hold it, and a separate Settings
 * button, because `openSettings` cannot target a tab — it would have been the
 * same button twice.
 */

const ICONS: Readonly<Record<string, string>> = {
  window: 'M4 5.5h16v13H4z M4 10h16',
  moon: 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z',
  pin: 'M12 17v4 M8.5 3h7l-1 6 3 3.5H6.5l3-3.5Z',
  hide: 'M3 3l18 18 M10.6 5.1A9.6 9.6 0 0 1 12 5c5 0 9 4.5 9 7a12 12 0 0 1-2.4 3.4 M6.5 6.7A12.6 12.6 0 0 0 3 12c0 2.5 4 7 9 7a9.7 9.7 0 0 0 4-.9',
};

export interface MochiAction {
  readonly id: string;
  readonly icon: keyof typeof ICONS | string;
  /** Shown in the caption while hovered. Say what pressing it will do. */
  readonly label: string;
  /** Lit when the setting it controls is on. */
  readonly active?: boolean;
  readonly onPick: () => void;
}

export function OverlayMochiActions({
  actions,
  visible,
  onHoverChange,
}: {
  actions: readonly MochiAction[];
  visible: boolean;
  /** The overlay is click-through except where it says otherwise. */
  onHoverChange: (interactive: boolean) => void;
}): JSX.Element | null {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const caption = actions.find((a) => a.id === hoveredId)?.label ?? '';

  if (actions.length === 0) return null;

  return (
    <>
      {/*
        Names whatever the pointer is over.

        A moon and a crossed-out eye do not explain themselves, and this row is
        the only route to any of these. Sitting bottom-left, clear of the row
        itself, which sits centred.
      */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 10,
          bottom: 46,
          maxWidth: 200,
          padding: '5px 10px',
          borderRadius: 8,
          background: 'rgba(23, 19, 30, 0.94)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          color: '#f4eef6',
          font: '11.5px/1.35 system-ui, sans-serif',
          boxShadow: '0 4px 14px rgba(0, 0, 0, 0.55)',
          opacity: visible && caption !== '' ? 1 : 0,
          transition: 'opacity 140ms ease',
          pointerEvents: 'none',
          zIndex: 26,
        }}
      >
        {caption}
      </div>

      <div
        role="group"
        aria-label="Mochi controls"
        style={{
          position: 'absolute',
          bottom: 8,
          left: '50%',
          transform: visible
            ? 'translateX(-50%) translateY(0) scale(1)'
            : 'translateX(-50%) translateY(14px) scale(0.85)',
          opacity: visible ? 1 : 0,
          pointerEvents: visible ? 'auto' : 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          zIndex: 25,
          transition: 'all 240ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
        // Re-arms interactivity on the way in. The alpha test behind
        // click-through only knows about the mascot's own pixels, so a row
        // sitting on transparent canvas is unclickable without this — the exact
        // reason every item of the radial menu ignored the mouse.
        onMouseEnter={() => onHoverChange(true)}
        onMouseLeave={() => {
          setHoveredId(null);
          onHoverChange(false);
        }}
      >
        {actions.map((action) => {
          const isHovered = hoveredId === action.id;
          const lit = action.active === true;
          return (
            <button
              key={action.id}
              type="button"
              aria-label={action.label}
              aria-pressed={action.active === true}
              onClick={(e) => {
                e.stopPropagation();
                action.onPick();
              }}
              onMouseEnter={() => {
                setHoveredId(action.id);
                onHoverChange(true);
              }}
              onMouseLeave={() => setHoveredId(null)}
              style={{
                width: 30,
                height: 30,
                borderRadius: '50%',
                padding: 0,
                background: lit ? 'rgba(242, 166, 179, 0.22)' : 'rgba(23, 19, 30, 0.92)',
                backdropFilter: 'blur(10px)',
                border: `1px solid ${
                  lit
                    ? 'rgba(242, 166, 179, 0.75)'
                    : isHovered
                      ? 'rgba(242, 166, 179, 0.6)'
                      : 'rgba(255, 255, 255, 0.22)'
                }`,
                boxShadow: lit
                  ? '0 0 12px rgba(242, 166, 179, 0.45), 0 2px 8px rgba(0,0,0,0.45)'
                  : '0 2px 8px rgba(0, 0, 0, 0.4)',
                color: lit ? '#f2a6b3' : '#f4eef6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transform: isHovered ? 'scale(1.22)' : 'scale(1)',
                transition: 'all 180ms cubic-bezier(0.34, 1.56, 0.64, 1)',
                outline: 'none',
              }}
            >
              <svg
                width={15}
                height={15}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d={ICONS[action.icon] ?? ICONS['window'] ?? ''} />
              </svg>
            </button>
          );
        })}
      </div>
    </>
  );
}
