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

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid #3b3244',
  background: '#241f2b',
  color: '#f4eef6',
  fontSize: 14,
  boxSizing: 'border-box',
  fontFamily: 'inherit',
};

const monoInputStyle: React.CSSProperties = {
  ...inputStyle,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
};

const labelStyle: React.CSSProperties = {
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
  azure: 'Azure OpenAI',
};

export function AiSection(): JSX.Element {
  const [status, setStatus] = useState<LlmStatus | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // Azure form state
  const [showAzure, setShowAzure] = useState(false);
  const [azureResource, setAzureResource] = useState('');
  const [azureDeployment, setAzureDeployment] = useState('');
  const [azureKey, setAzureKey] = useState('');
  const [azureBusy, setAzureBusy] = useState(false);
  const [azureMessage, setAzureMessage] = useState<{ ok: boolean; text: string } | null>(null);

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
        setKeyInput('');
      } else {
        setMessage({ ok: false, text: result.error ?? 'That key did not work.' });
      }
    } finally {
      setBusy(false);
    }
  }, [keyInput]);

function cleanAzureResource(input: string): string {
  let s = input.trim().replace(/^https?:\/\//i, '');
  const match = /^([^./]+)\.openai\.azure\.com/i.exec(s);
  if (match) return match[1];
  return s.split('/')[0].split('.')[0].trim();
}

  const saveAzure = useCallback(async () => {
    const resource = cleanAzureResource(azureResource);
    const deployment = azureDeployment.trim();
    const key = azureKey.trim();
    if (!resource || !deployment || !key) {
      setAzureMessage({ ok: false, text: 'All three fields are required.' });
      return;
    }
    setAzureResource(resource);
    setAzureBusy(true);
    setAzureMessage(null);
    try {
      const result = await window.mochi.llm.saveAzureKey(resource, deployment, key);
      if (result.ok) {
        setAzureMessage({
          ok: true,
          text: `Azure OpenAI connected — deployment "${deployment}" ready.`,
        });
        setAzureKey('');
      } else {
        setAzureMessage({ ok: false, text: result.error ?? 'Azure credentials did not work.' });
      }
    } finally {
      setAzureBusy(false);
    }
  }, [azureResource, azureDeployment, azureKey]);

  const runTest = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      const r = await window.mochi.llm.test();
      setMessage(
        r.ok
          ? { ok: true, text: `${r.model}: "${r.text}" (${r.tokens} tokens)` }
          : { ok: false, text: r.text },
      );
    } finally {
      setBusy(false);
    }
  }, []);

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

      {/* Standard key paste — OpenAI / Anthropic / Google */}
      <div>
        <span style={labelStyle}>Add an API key (OpenAI / Anthropic / Google)</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            style={monoInputStyle}
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
          <p style={{ margin: '8px 0 0', fontSize: 12, color: message.ok ? '#a8e6b8' : '#ffb3c1' }}>
            {message.text}
          </p>
        )}
      </div>

      {/* Azure OpenAI — expandable section */}
      <div style={{ borderTop: '1px solid #2c2634', paddingTop: 14 }}>
        <button
          id="azure-toggle-btn"
          onClick={() => setShowAzure((v) => !v)}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#f2a6b3',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span style={{ fontSize: 11 }}>{showAzure ? '▾' : '▸'}</span>
          Azure OpenAI
        </button>

        {showAzure && (
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 12, opacity: 0.7, lineHeight: 1.6 }}>
              Enter your Azure OpenAI resource name, deployment name, and API key. Find these in{' '}
              <strong style={{ color: '#f4eef6' }}>
                Azure Portal → Azure OpenAI → Keys and Endpoint
              </strong>
              .
            </div>

            <div>
              <span style={labelStyle}>Resource Name</span>
              <input
                id="azure-resource-input"
                type="text"
                placeholder="my-resource  (not the full URL)"
                value={azureResource}
                onChange={(e) => setAzureResource(e.target.value)}
                style={inputStyle}
                autoComplete="off"
                spellCheck={false}
              />
              <p style={{ margin: '4px 0 0', fontSize: 11, opacity: 0.5 }}>
                e.g. if your endpoint is <em>my-resource.openai.azure.com</em>, enter{' '}
                <strong>my-resource</strong>
              </p>
            </div>

            <div>
              <span style={labelStyle}>Deployment Name</span>
              <input
                id="azure-deployment-input"
                type="text"
                placeholder="gpt-4o"
                value={azureDeployment}
                onChange={(e) => setAzureDeployment(e.target.value)}
                style={inputStyle}
                autoComplete="off"
                spellCheck={false}
              />
            </div>

            <div>
              <span style={labelStyle}>API Key</span>
              <input
                id="azure-key-input"
                type="password"
                placeholder="32-char hex key from Azure Portal"
                value={azureKey}
                onChange={(e) => setAzureKey(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void saveAzure();
                }}
                style={monoInputStyle}
                autoComplete="off"
                spellCheck={false}
              />
            </div>

            {azureMessage !== null && (
              <p
                style={{
                  margin: 0,
                  fontSize: 12,
                  color: azureMessage.ok ? '#a8e6b8' : '#ffb3c1',
                }}
              >
                {azureMessage.text}
              </p>
            )}

            <button
              id="azure-connect-btn"
              onClick={() => void saveAzure()}
              disabled={azureBusy || !azureResource || !azureDeployment || !azureKey}
              style={{
                alignSelf: 'flex-start',
                padding: '9px 20px',
                borderRadius: 10,
                border: 'none',
                background: '#f2a6b3',
                color: '#241f2b',
                fontWeight: 600,
                fontSize: 13,
                cursor: azureBusy ? 'default' : 'pointer',
                opacity:
                  azureBusy || !azureResource || !azureDeployment || !azureKey ? 0.5 : 1,
              }}
            >
              {azureBusy ? 'Validating…' : 'Connect Azure OpenAI'}
            </button>
          </div>
        )}
      </div>

      {status.ready && (
        <button
          onClick={() => void runTest()}
          disabled={busy}
          style={{
            alignSelf: 'flex-start',
            background: 'transparent',
            border: '1px solid #3b3244',
            color: '#f4eef6',
            borderRadius: 8,
            padding: '6px 14px',
            fontSize: 13,
            cursor: busy ? 'default' : 'pointer',
          }}
        >
          {busy ? 'Asking…' : 'Test it'}
        </button>
      )}

      {status.ready && (
        <div>
          <span style={labelStyle}>Today&apos;s usage</span>
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
