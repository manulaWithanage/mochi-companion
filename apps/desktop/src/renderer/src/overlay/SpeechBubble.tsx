import { useEffect, useRef, useState, type JSX } from 'react';

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
}

const FADE_MS = 200;

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

export function SpeechBubble({ text, onDismiss, onHoverChange }: Props): JSX.Element | null {
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
        background: 'linear-gradient(145deg, rgba(48, 37, 58, 0.98) 0%, rgba(28, 21, 35, 0.98) 100%)',
        color: '#ffffff',
        font: '600 13px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif',
        border: '1px solid rgba(242, 166, 179, 0.45)',
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

      {/* Tail, pointing down at the mascot. */}
      <span
        style={{
          position: 'absolute',
          right: 14,
          bottom: -TAIL,
          width: 0,
          height: 0,
          borderLeft: `${TAIL}px solid transparent`,
          borderRight: `${TAIL - 4}px solid transparent`,
          borderTop: `${TAIL + 1}px solid #1c1523`,
          filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.6))',
        }}
      />
    </div>
  );
}
