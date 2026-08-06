import { useEffect, useRef, useState, type JSX } from 'react';
import { ITEM_SIZE_PX, radialPlacements } from '@mochi/core';

/**
 * Right-click on the mascot: the things Mochi can do, arced around it.
 *
 * Right-click used to open Settings directly, which is a strange thing for the
 * only secondary gesture in the app to do — undiscoverable, and it spent the
 * whole gesture on one destination. Everything else was hidden too: the tray
 * menu, the category pills that appear on left-click and vanish after four and
 * a half seconds, Do Not Disturb buried in a settings tab.
 *
 * A ring rather than a context menu because a grey OS menu beside a round
 * character reads as belonging to a different application — the same mistake
 * as the native checkboxes in the setup wizard. It also makes every item the
 * same flick away, where a list buries whatever is at the bottom, and position
 * becomes memorable in a way list order never is.
 *
 * Geometry and the fit assertion live in `@mochi/core`; this file is placement
 * and interaction only.
 */

/**
 * A stroked glyph for the fixed actions.
 *
 * Projects bring their own emoji — that is the icon the user picked and the
 * dashboard shows the same one — but the fixed actions are ours, so they are
 * drawn to match the rest of Mochi's iconography rather than borrowing a
 * platform emoji that renders differently on every machine.
 */
export function MenuGlyph({ d }: { d: string }): JSX.Element {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

export interface RadialItem {
  readonly id: string;
  /** Emoji for a project, or an inline SVG node for a fixed action. */
  readonly glyph: JSX.Element | string;
  readonly label: string;
  /** Drawn in the accent colour — the running project, or DND while on. */
  readonly active?: boolean;
  /**
   * Leave the ring open after picking.
   *
   * For toggles. Closing on the press of a switch hides the very thing the
   * press was for — you flip Do Not Disturb and the menu vanishes before the
   * icon has finished lighting up, so the only feedback is that something
   * disappeared.
   */
  readonly keepOpen?: boolean;
  readonly onPick: () => void;
}

export function RadialMenu({
  open,
  items,
  mascotSizePx,
  onDismiss,
  onHoverChange,
}: {
  open: boolean;
  items: readonly RadialItem[];
  mascotSizePx: number;
  onDismiss: () => void;
  /** The overlay only accepts clicks where it reports itself interactive. */
  onHoverChange: (interactive: boolean) => void;
}): JSX.Element | null {
  const [focused, setFocused] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Escape closes, arrows walk the arc. A menu reachable only by mouse is one
  // some people cannot reach at all, and the ring is the only route to several
  // of these actions.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onDismiss();
        return;
      }
      if (items.length === 0) return;
      if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
        event.preventDefault();
        setFocused((f) => (f - 1 + items.length) % items.length);
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
        event.preventDefault();
        setFocused((f) => (f + 1) % items.length);
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        const item = items[focused];
        item?.onPick();
        if (item?.keepOpen !== true) onDismiss();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, items, focused, onDismiss]);

  useEffect(() => {
    if (open) setFocused(0);
  }, [open]);

  // Told explicitly rather than left to the canvas alpha test, which knows
  // only about the mascot's own pixels — with the ring open the window has to
  // accept clicks over empty space it would otherwise pass straight through.
  useEffect(() => {
    if (open) onHoverChange(true);
  }, [open, onHoverChange]);

  if (items.length === 0) return null;

  const placements = radialPlacements(items.length, mascotSizePx);
  const focusedLabel = items[focused]?.label ?? '';

  return (
    <>
      {/*
        What the icon under the pointer actually does.

        A ring of unlabelled circles is a guessing game on first use — a
        briefcase and a moon tell you nothing about what pressing them will do,
        and the native `title` tooltip takes a second to appear and looks like
        it belongs to another application. This is the difference between a
        menu you can learn and one you have to already know.

        Pinned to the window's top-left rather than following the pointer:
        the arc reaches no further than about (101, 61) at the largest mascot,
        so this corner is always clear of the icons, and a label that holds
        still is easier to read than one that chases the cursor.
      */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 10,
          top: 10,
          maxWidth: 150,
          padding: '5px 10px',
          borderRadius: 8,
          background: 'rgba(32, 24, 40, 0.94)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          color: '#f4eef6',
          font: '11.5px/1.35 system-ui, sans-serif',
          textAlign: 'left',
          boxShadow: '0 4px 14px rgba(0, 0, 0, 0.55)',
          opacity: open && focusedLabel !== '' ? 1 : 0,
          transform: open ? 'translateY(0)' : 'translateY(-4px)',
          transition: 'opacity 140ms ease, transform 140ms ease',
          pointerEvents: 'none',
        }}
      >
        {focusedLabel}
      </div>

      <div
        ref={containerRef}
        role="menu"
        aria-label="Mochi actions"
        aria-hidden={!open}
        style={{
          position: 'absolute',
          // The mascot box is anchored bottom-right and is 200px square, so its
          // centre is 100px in from both of those edges.
          right: 100,
          bottom: 100,
          width: 0,
          height: 0,
          pointerEvents: open ? 'auto' : 'none',
        }}
      >
        {items.map((item, i) => {
          const p = placements[i];
          if (p === undefined) return null;
          const isFocused = i === focused;
          return (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              tabIndex={-1}
              aria-label={item.label}
              title={item.label}
              onMouseEnter={() => setFocused(i)}
              onClick={(e) => {
                e.stopPropagation();
                item.onPick();
                if (item.keepOpen !== true) onDismiss();
              }}
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: ITEM_SIZE_PX,
                height: ITEM_SIZE_PX,
                margin: 0,
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%',
                border: `1px solid ${
                  item.active === true ? 'rgba(242, 166, 179, 0.75)' : 'rgba(255, 255, 255, 0.14)'
                }`,
                background:
                  item.active === true ? 'rgba(242, 166, 179, 0.22)' : 'rgba(32, 24, 40, 0.94)',
                color: item.active === true ? '#f2a6b3' : '#f4eef6',
                fontSize: 16,
                lineHeight: 1,
                cursor: 'pointer',
                boxShadow: isFocused
                  ? '0 6px 18px rgba(0,0,0,0.6), 0 0 0 2px rgba(242,166,179,0.5)'
                  : '0 4px 14px rgba(0,0,0,0.55)',
                // Closed, everything sits at the mascot's centre at 40% scale, so
                // opening reads as the items coming out of Mochi rather than
                // fading in over it.
                transform: open
                  ? `translate(calc(-50% + ${p.x}px), calc(-50% + ${p.y}px)) scale(${isFocused ? 1.12 : 1})`
                  : 'translate(-50%, -50%) scale(0.4)',
                opacity: open ? 1 : 0,
                // Staggered outward. Closing runs together, because a menu that
                // takes as long to leave as to arrive feels slow.
                transitionDelay: `${open ? i * 24 : 0}ms`,
                transition:
                  'transform 200ms cubic-bezier(0.16, 1, 0.3, 1), opacity 140ms ease, box-shadow 140ms ease',
                willChange: 'transform, opacity',
              }}
            >
              {item.glyph}
            </button>
          );
        })}
      </div>
    </>
  );
}
