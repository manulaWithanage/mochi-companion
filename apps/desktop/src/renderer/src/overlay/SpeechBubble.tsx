import { useEffect, useState, type JSX } from 'react';

/**
 * Mochi's speech bubble.
 *
 * Anchored to the mascot, not to the window. The mascot occupies the
 * bottom-right 200x200 of the overlay, so the bubble is positioned from the
 * bottom-right too and grows upward and leftward as the text gets longer —
 * which keeps the tail attached to Mochi's head at any message length.
 *
 * Text is rendered as React children — never innerHTML (RULE 1). In V2 this
 * will carry LLM output and email-derived content, both attacker-influenced,
 * so it must stay a text node.
 */

interface Props {
  readonly text: string | null;
  readonly onDismiss: () => void;
}

const FADE_MS = 220;

/** Clear of the mascot's head, measured against the 300px expanded window. */
const BOTTOM_OFFSET = 164;
/** Puts the tail over the mascot rather than off to one side. */
const RIGHT_OFFSET = 58;
const TAIL = 9;
const BG = 'rgba(38, 30, 44, 0.95)';

export function SpeechBubble({ text, onDismiss }: Props): JSX.Element | null {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (text === null) {
      setVisible(false);
      return;
    }
    // Next frame, so the transition runs instead of snapping in.
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, [text]);

  if (text === null) return null;

  return (
    <div
      onClick={onDismiss}
      style={{
        position: 'absolute',
        right: RIGHT_OFFSET,
        bottom: BOTTOM_OFFSET,
        maxWidth: 250,
        // Short messages should hug the mascot, not stretch toward the corner.
        width: 'max-content',
        padding: '10px 13px',
        borderRadius: 15,
        borderBottomRightRadius: 5,
        background: BG,
        color: '#fdf6f8',
        font: '500 13px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif',
        boxShadow: '0 6px 20px rgba(0, 0, 0, 0.38)',
        border: '1px solid rgba(255, 255, 255, 0.09)',
        overflowWrap: 'anywhere',
        cursor: 'pointer',
        opacity: visible ? 1 : 0,
        // Scale from the corner nearest Mochi so it reads as coming from it.
        transformOrigin: '100% 100%',
        transform: visible ? 'translateY(0) scale(1)' : 'translateY(4px) scale(0.94)',
        transition: `opacity ${FADE_MS}ms ease, transform ${FADE_MS}ms cubic-bezier(0.2, 0.9, 0.3, 1.25)`,
        pointerEvents: 'auto',
      }}
    >
      {text}

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
          borderTop: `${TAIL + 1}px solid ${BG}`,
        }}
      />
    </div>
  );
}
