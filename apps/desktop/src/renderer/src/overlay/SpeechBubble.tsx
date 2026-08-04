import { useEffect, useRef, useState, type JSX } from 'react';
import type { BubbleAction } from '@mochi/core';

/**
 * Mochi's speech bubble.
 *
 * Anchored to the mascot, not to the window. The mascot occupies the
 * bottom-right of the overlay, so the bubble is positioned from the same
 * corner and grows upward and leftward as text gets longer — which keeps the
 * tail attached to Mochi's head at any message length.
 *
 * Text is rendered as React children — never innerHTML (RULE 1). In V2 this
 * will carry LLM output and email-derived content, both attacker-influenced,
 * so it must stay a text node.
 */

interface Props {
  readonly text: string | null;
  readonly onDismiss: () => void;
  /** The window is click-through; hovering the bubble must re-enable input. */
  readonly onHoverChange: (hovering: boolean) => void;
  /** Buttons main offered for this bubble. Ids are opaque and echoed back. */
  readonly actions?: readonly BubbleAction[];
  readonly onAction?: (actionId: string) => void;
}

const FADE_MS = 200;

/**
 * The outline, in one place.
 *
 * The tail used to hardcode its own fill while the bubble used a gradient, so
 * the two could drift apart — and the tail carried no outline at all, which is
 * what left a gap in the bubble's border where it joined.
 */
const OUTLINE = 'rgba(242, 166, 179, 0.45)';
/** The gradient's far end: what the bubble looks like exactly where the tail joins. */
const BUBBLE_END = 'rgba(28, 21, 35, 0.98)';

/** Clear of the mascot's head, measured against the 300px window. */
const BOTTOM_OFFSET = 164;
/** Puts the tail over the mascot rather than off to one side. */
const RIGHT_OFFSET = 58;
const TAIL = 9;

function formatConversationalText(raw: string | null): string | null {
  if (raw === null) return null;
  let text = raw.replace(/[—–]/g, ',');
  if (text.endsWith('.')) {
    text = text.slice(0, -1);
  }
  return text;
}

export function SpeechBubble({
  text,
  onDismiss,
  onHoverChange,
  actions,
  onAction,
}: Props): JSX.Element | null {
  const [visible, setVisible] = useState(false);
  const [rendered, setRendered] = useState<string | null>(null);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (exitTimer.current !== undefined) clearTimeout(exitTimer.current);

    if (text !== null) {
      setRendered(formatConversationalText(text));
      const id = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(id);
    }

    setVisible(false);
    exitTimer.current = setTimeout(() => setRendered(null), FADE_MS);
    return () => {
      if (exitTimer.current !== undefined) clearTimeout(exitTimer.current);
    };
  }, [text]);

  if (rendered === null) return null;

  return (
    <div
      onClick={onDismiss}
      onPointerEnter={() => onHoverChange(true)}
      onPointerLeave={() => onHoverChange(false)}
      style={{
        position: 'absolute',
        right: RIGHT_OFFSET,
        bottom: BOTTOM_OFFSET,
        maxWidth: 250,
        width: 'max-content',
        padding: '11px 15px',
        borderRadius: 16,
        borderBottomRightRadius: 5,
        background: `linear-gradient(145deg, rgba(48, 37, 58, 0.98) 0%, ${BUBBLE_END} 100%)`,
        color: '#ffffff',
        font: '600 13px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif',
        border: `1px solid ${OUTLINE}`,
        boxShadow:
          '0 14px 36px rgba(0, 0, 0, 0.8), 0 0 24px rgba(242, 166, 179, 0.32), inset 0 1px 0 rgba(255, 255, 255, 0.18)',
        backdropFilter: 'blur(16px)',
        overflowWrap: 'anywhere',
        cursor: 'pointer',
        opacity: visible ? 1 : 0,
        transformOrigin: '100% 100%',
        transform: visible ? 'translateY(0) scale(1)' : 'translateY(4px) scale(0.94)',
        transition: `opacity ${FADE_MS}ms ease, transform ${FADE_MS}ms cubic-bezier(0.2, 0.9, 0.3, 1.25)`,
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      {rendered}

      {/*
        What the user can do about this, without opening the dashboard.

        Before this the only possible reply to a reminder was to wave it away,
        which is why a reminder could nag but never be satisfied. Clicks are
        stopped from propagating: the bubble body dismisses, and pressing a
        button is the opposite of dismissing.
      */}
      {actions !== undefined && actions.length > 0 && onAction !== undefined && (
        <div style={{ display: 'flex', gap: 6, marginTop: 9 }}>
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onAction(action.id);
              }}
              style={{
                flex: 1,
                padding: '5px 10px',
                borderRadius: 9,
                border: '1px solid rgba(242, 166, 179, 0.55)',
                background: 'rgba(242, 166, 179, 0.16)',
                color: '#ffffff',
                font: '650 11.5px/1 system-ui, -apple-system, "Segoe UI", sans-serif',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}

      {/*
        Tail, pointing down at the mascot.

        A square rotated 45 degrees and half-buried in the bubble, rather than
        the usual CSS-triangle trick. A triangle can only be a solid fill, so it
        sat on top of the bubble's 1px border and punched a visible gap in it
        while having no outline of its own.

        Two adjacent borders on the rotated square give the tail an outline that
        continues the bubble's, and the buried half is hidden behind the bubble's
        own background — which is also what leaves the mouth open, since a child
        paints over its parent's border.
      */}
      <span
        style={{
          position: 'absolute',
          right: 15,
          bottom: -TAIL / 2 - 1,
          width: TAIL + 3,
          height: TAIL + 3,
          background: BUBBLE_END,
          borderRight: `1px solid ${OUTLINE}`,
          borderBottom: `1px solid ${OUTLINE}`,
          borderBottomRightRadius: 3,
          transform: 'rotate(45deg)',
          filter: 'drop-shadow(1px 1px 2px rgba(0, 0, 0, 0.45))',
        }}
      />
    </div>
  );
}
