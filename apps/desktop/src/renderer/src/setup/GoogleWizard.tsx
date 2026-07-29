import { useState, type JSX } from 'react';
import { looksLikeClientId, WIZARD_STEPS } from '@mochi/core';
import { button, C, card, input, label } from './ui.js';

/**
 * The BYO-Google-Cloud-Project wizard.
 *
 * Two things it exists to get right.
 *
 * **Deep links, not directions.** Every step opens the exact console page in
 * the real browser. "Navigate to APIs & Services" is how people get lost.
 *
 * **Step 4 gets its own screen and a warning colour.** Leaving the consent
 * screen in Testing expires refresh tokens after 7 days — the user is logged
 * out every week with an `invalid_grant` and no visible cause. It is the
 * cheapest step to skip and the most expensive to diagnose, and almost every
 * tutorial online gives the advice that causes it.
 */

interface Props {
  readonly onDone: () => void;
  readonly onCancel: () => void;
}

export function GoogleWizard({ onDone, onCancel }: Props): JSX.Element {
  const [index, setIndex] = useState(0);
  const [clientId, setClientId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const step = WIZARD_STEPS[index]!;
  const last = index === WIZARD_STEPS.length - 1;
  const critical = step.critical === true;
  const idValid = looksLikeClientId(clientId);

  const connect = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const result = await window.mochi.google.connect(clientId);
      if (result.ok) onDone();
      else setError(result.error ?? 'Could not connect.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        ...card,
        borderColor: critical ? 'rgba(255,179,193,0.45)' : C.border,
        background: critical ? 'rgba(255,179,193,0.06)' : C.panel,
      }}
    >
      {/* progress */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {WIZARD_STEPS.map((s, i) => (
          <div
            key={s.n}
            style={{
              flex: 1,
              height: 3,
              borderRadius: 2,
              background:
                i < index ? C.accent : i === index ? (critical ? C.warn : C.accent) : '#332c3d',
            }}
          />
        ))}
      </div>

      <div style={{ fontSize: 11.5, color: critical ? C.warn : C.faint, marginBottom: 6 }}>
        STEP {step.n} OF {WIZARD_STEPS.length}
        {critical && ' · DO NOT SKIP'}
      </div>

      <h3 style={{ margin: '0 0 8px', fontSize: 17, color: critical ? C.warn : C.text }}>
        {step.title}
      </h3>
      <p style={{ margin: '0 0 16px', fontSize: 13.5, lineHeight: 1.6, color: C.dim }}>
        {step.body}
      </p>

      {step.link !== undefined && (
        <button
          style={{ ...button(critical ? 'primary' : 'ghost'), marginBottom: 16 }}
          onClick={() => window.mochi.google.openStep(step.link!)}
        >
          {step.linkLabel} ↗
        </button>
      )}

      {last && (
        <div style={{ marginBottom: 16 }}>
          <span style={label}>Client ID</span>
          <input
            style={input}
            placeholder="123456-abc.apps.googleusercontent.com"
            value={clientId}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => setClientId(e.target.value)}
          />
          {clientId.length > 0 && !idValid && (
            <p style={{ color: C.warn, fontSize: 12, margin: '6px 0 0' }}>
              That should end in <code>.apps.googleusercontent.com</code> — make sure it is the
              Client ID, not the secret.
            </p>
          )}
        </div>
      )}

      {error !== null && (
        <p
          style={{
            fontSize: 12.5,
            lineHeight: 1.6,
            color: C.warn,
            background: 'rgba(255,179,193,0.08)',
            border: `1px solid rgba(255,179,193,0.2)`,
            borderRadius: 8,
            padding: '10px 12px',
            margin: '0 0 14px',
          }}
        >
          {error}
        </p>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
        <button
          style={button('ghost')}
          onClick={() => (index === 0 ? onCancel() : setIndex(index - 1))}
        >
          {index === 0 ? 'Cancel' : 'Back'}
        </button>

        {last ? (
          <button
            style={button('primary')}
            disabled={!idValid || busy}
            onClick={() => void connect()}
          >
            {busy ? 'Waiting for Google…' : 'Connect'}
          </button>
        ) : (
          <button style={button('primary')} onClick={() => setIndex(index + 1)}>
            {critical ? 'Done — I published it' : 'Next'}
          </button>
        )}
      </div>
    </div>
  );
}
