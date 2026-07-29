import { useCallback, useEffect, useState, type JSX } from 'react';
import type { LlmStatus, ProviderId } from '@mochi/core';

/**
 * The AI panel in Settings.
 *
 * Two things it must get right:
 *
 * 1. **One paste, not a form.** The user pastes a key; Mochi works out which
 *    provider it is and fetches that provider's live model list. No dropdown
 *    to pick the provider, and no model IDs written into the UI.
 * 2. **Say when nothing is needed.** If Ollama is running, the honest message
 *    is "you're already set up", not a key field.
 *
 * The raw key goes straight to main and never comes back — everything shown
 * here is redacted (RULE 1).
 */

const box: React.CSSProperties = {
  border: '1px solid #2c2634',
  borderRadius: 12,
  padding: '14px 16px',
  background: '#221d29',
};

const input: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid #3b3244',
  background: '#241f2b',
  color: '#f4eef6',
  fontSize: 14,
  boxSizing: 'border-box',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
};

const label: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  letterSpacing: 0.4,
  textTransform: 'uppercase',
  opacity: 0.6,
  marginBottom: 8,
};

const PROVIDER_LABEL: Record<ProviderId, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google Gemini',
  ollama: 'Ollama',
};

export function AiSection(): JSX.Element {
  const [status, setStatus] = useState<LlmStatus | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    void window.mochi.llm.status().then(setStatus);
    return window.mochi.llm.onChange(setStatus);
  }, []);

  const save = useCallback(async () => {
    if (keyInput.trim().length === 0) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await window.mochi.llm.saveKey(keyInput);
      if (result.ok && result.provider !== null) {
        setMessage({
          ok: true,
          text: `${PROVIDER_LABEL[result.provider]} connected — ${result.modelCount} models available.`,
        });
        // Clear immediately: no reason for the key to sit in a DOM node.
        setKeyInput('');
      } else {
        setMessage({ ok: false, text: result.error ?? 'That key did not work.' });
      }
    } finally {
      setBusy(false);
    }
  }, [keyInput]);

  if (status === null) return <div style={box}>Checking for models…</div>;

  const capPct =
    status.dailyTokenCap > 0 ? Math.min(100, (status.spentToday / status.dailyTokenCap) * 100) : 0;

  return (
    <div style={{ ...box, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <strong style={{ fontSize: 15 }}>AI</strong>
        <span style={{ fontSize: 12, opacity: 0.6 }}>
          {status.ready ? `${status.models.length} model(s) ready` : 'not set up'}
        </span>
      </div>

      {status.ollamaAvailable && (
        <div style={{ fontSize: 13, color: '#a8e6b8', lineHeight: 1.5 }}>
          ✓ <strong>Ollama detected.</strong> Everything works already — no key, no account. Add a
          cloud key below only if you want a stronger model.
        </div>
      )}

      {!status.ollamaAvailable && status.configured.length === 0 && (
        <div style={{ fontSize: 13, opacity: 0.75, lineHeight: 1.5 }}>
          Paste any OpenAI, Anthropic or Google key — Mochi works out which is which. Or{' '}
          <a
            href="https://ollama.com"
            style={{ color: '#f2a6b3' }}
            onClick={(e) => {
              // Opened in the real browser by the main process handler.
              e.preventDefault();
            }}
          >
            run Ollama
          </a>{' '}
          for a free local model with no key at all.
        </div>
      )}

      {status.configured.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {status.configured.map((c) => (
            <div
              key={c.provider}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
            >
              <span style={{ fontSize: 13 }}>
                {PROVIDER_LABEL[c.provider]}{' '}
                <code style={{ opacity: 0.55, fontSize: 12 }}>{c.redacted}</code>
              </span>
              <button
                onClick={() => void window.mochi.llm.forgetKey(c.provider)}
                style={{
                  background: 'transparent',
                  border: '1px solid #3b3244',
                  color: '#f4eef6',
                  borderRadius: 8,
                  padding: '3px 10px',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <div>
        <span style={label}>Add an API key</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            style={input}
            type="password"
            placeholder="sk-… / AIza…"
            value={keyInput}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => setKeyInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void save();
            }}
          />
          <button
            onClick={() => void save()}
            disabled={busy || keyInput.trim().length === 0}
            style={{
              padding: '10px 16px',
              borderRadius: 10,
              border: 'none',
              background: '#f2a6b3',
              color: '#241f2b',
              fontWeight: 600,
              fontSize: 14,
              cursor: busy ? 'default' : 'pointer',
              opacity: busy || keyInput.trim().length === 0 ? 0.5 : 1,
              whiteSpace: 'nowrap',
            }}
          >
            {busy ? 'Checking…' : 'Connect'}
          </button>
        </div>
        {message !== null && (
          <p
            style={{
              margin: '8px 0 0',
              fontSize: 12,
              color: message.ok ? '#a8e6b8' : '#ffb3c1',
            }}
          >
            {message.text}
          </p>
        )}
      </div>

      {status.ready && (
        <div>
          <span style={label}>Today&apos;s usage</span>
          <div
            style={{ height: 6, borderRadius: 3, background: '#332c3d', overflow: 'hidden' }}
            title={`${status.spentToday.toLocaleString()} of ${status.dailyTokenCap.toLocaleString()} tokens`}
          >
            <div
              style={{
                width: `${capPct}%`,
                height: '100%',
                background: capPct > 85 ? '#ffb3c1' : '#f2a6b3',
              }}
            />
          </div>
          <p style={{ margin: '6px 0 0', fontSize: 12, opacity: 0.55 }}>
            {status.spentToday.toLocaleString()} /{' '}
            {status.dailyTokenCap === 0 ? 'unlimited' : status.dailyTokenCap.toLocaleString()}{' '}
            tokens — you pay your provider directly; Mochi never sees a bill.
          </p>
        </div>
      )}
    </div>
  );
}
