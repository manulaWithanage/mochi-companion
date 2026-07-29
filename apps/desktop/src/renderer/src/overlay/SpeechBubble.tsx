import { useEffect, useState, type JSX } from 'react';

/**
 * Mochi's speech bubble.
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

export function SpeechBubble({ text, onDismiss }: Props): JSX.Element | null {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (text === null) {
      setVisible(false);
      return;
    }
    // Next frame, so the transition actually runs instead of snapping in.
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, [text]);

  if (text === null) return null;

  return (
    <div
      onClick={onDismiss}
      style={{
        position: 'absolute',
        left: 8,
        top: 8,
        maxWidth: 300,
        padding: '11px 14px',
        borderRadius: 16,
        borderBottomRightRadius: 4,
        background: 'rgba(38, 30, 44, 0.94)',
        color: '#fdf6f8',
        font: '500 13px/1.42 system-ui, -apple-system, "Segoe UI", sans-serif',
        boxShadow: '0 6px 22px rgba(0, 0, 0, 0.34)',
        border: '1px solid rgba(255, 255, 255, 0.09)',
        // Wrap long text rather than letting it escape the window.
        overflowWrap: 'anywhere',
        cursor: 'pointer',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0) scale(1)' : 'translateY(6px) scale(0.96)',
        transition: `opacity ${FADE_MS}ms ease, transform ${FADE_MS}ms cubic-bezier(0.2, 0.9, 0.3, 1.2)`,
        pointerEvents: 'auto',
      }}
    >
      {text}
    </div>
  );
}
