import { useCallback, useEffect, useState, type JSX } from 'react';
import {
  LOCAL_PROVIDERS,
  cleanAzureResourceName,
  normaliseBaseUrl,
  providerLabel,
  type LlmStatus,
  type LocalProviderStatus,
} from '@mochi/core';

/**
 * The AI panel in Settings.
 *
 * Redesigned for crystal-clear user understanding:
 * 1. Prominent overall status banner showing active models and a test button.
 * 2. Local Providers (Ollama / LM Studio) shown with clean status pills (no scary "fetch failed" errors).
 * 3. Cloud Providers shown as explicit connected cards with high-contrast "Remove Key" buttons.
 * 4. Intuitive API key connection card with auto-detection for OpenAI, Anthropic, and Google Gemini.
 */

const C = {
  ok: '#a8e6b8',
  warn: '#ffb3c1',
  accent: '#f2a6b3',
  text: '#f4eef6',
  panel: '#221d29',
  field: '#241f2b',
  border: '#2c2634',
  edge: '#3b3244',
  track: '#332c3d',
  dim: '#9d94a8',
  // Disabled text. The shared palette in ui.ts has this; this local copy
  // did not, so a disabled button referenced a colour that did not exist.
  faint: 'rgba(244, 238, 246, 0.38)',
};

const box: React.CSSProperties = {
  border: `1px solid ${C.border}`,
  borderRadius: 14,
  padding: '18px 20px',
  background: C.panel,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 10,
  border: `1px solid ${C.edge}`,
  background: C.field,
  color: C.text,
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

const sectionTitle: React.CSSProperties = {
  fontSize: 12,
  letterSpacing: 0.5,
  textTransform: 'uppercase',
  opacity: 0.6,
  marginBottom: 10,
  fontWeight: 650,
};

const primaryButton = (disabled: boolean): React.CSSProperties => ({
  padding: '10px 18px',
  borderRadius: 10,
  border: disabled ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(242, 166, 179, 0.4)',
  background: disabled ? 'rgba(255, 255, 255, 0.08)' : 'linear-gradient(135deg, #f2a6b3, #e58597)',
  color: disabled ? C.faint : '#1c1625',
  fontWeight: 700,
  fontSize: 13.5,
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.6 : 1,
  whiteSpace: 'nowrap',
  boxShadow: disabled ? 'none' : '0 4px 14px rgba(242, 166, 179, 0.35)',
  transition: 'all 160ms cubic-bezier(0.4, 0, 0.2, 1)',
});

const ghostButton: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.05)',
  border: `1px solid ${C.edge}`,
  color: C.text,
  borderRadius: 10,
  padding: '7px 15px',
  fontSize: 12.5,
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'all 160ms ease',
};

type Note = { readonly ok: boolean; readonly text: string } | null;

const NoteLine = ({ note }: { note: Note }): JSX.Element | null =>
  note === null ? null : (
    <p
      style={{ margin: '8px 0 0', fontSize: 12.5, lineHeight: 1.5, color: note.ok ? C.ok : C.warn }}
    >
      {note.text}
    </p>
  );

/**
 * One local runtime: whether it answered, and where to look for it.
 */
function LocalRuntimeRow({
  info,
  status,
}: {
  readonly info: (typeof LOCAL_PROVIDERS)[number];
  readonly status: LocalProviderStatus | undefined;
}): JSX.Element {
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);

  const available = status?.available === true;
  const shown = status?.baseUrl ?? info.defaultBaseUrl ?? '';

  const apply = useCallback(
    async (next: string | null) => {
      setBusy(true);
      try {
        await window.mochi.llm.setLocalEndpoint(info.id, next);
        setEditing(false);
      } finally {
        setBusy(false);
      }
    },
    [info.id],
  );

  return (
    <div
      style={{
        border: `1px solid ${available ? 'rgba(168,230,184,0.35)' : C.border}`,
        background: available
          ? 'linear-gradient(135deg, rgba(168,230,184,0.08) 0%, rgba(168,230,184,0.02) 100%)'
          : 'rgba(255,255,255,0.02)',
        borderRadius: 12,
        padding: '14px 16px',
        transition: 'all 140ms ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: available ? C.ok : 'rgba(255, 255, 255, 0.25)',
              display: 'inline-block',
              boxShadow: available ? `0 0 8px ${C.ok}` : 'none',
            }}
          />
          <div>
            <div style={{ fontSize: 14, fontWeight: 650, color: '#ffffff' }}>{info.label}</div>
            <div style={{ fontSize: 12, color: available ? C.ok : C.dim, marginTop: 2 }}>
              {available ? (
                <span>
                  🟢 Running: <strong>{status?.modelCount}</strong> model
                  {status?.modelCount === 1 ? '' : 's'} ready
                </span>
              ) : (
                <span>⚪ Offline. Server not detected on port</span>
              )}
            </div>
          </div>
        </div>

        <button
          style={{
            ...ghostButton,
            padding: '6px 12px',
            fontSize: 12,
            background: editing ? 'rgba(255,255,255,0.08)' : 'transparent',
          }}
          onClick={() => setEditing((v) => !v)}
          disabled={busy}
        >
          {editing ? 'Close' : 'Configure Port'}
        </button>
      </div>

      <div
        style={{
          fontSize: 12,
          opacity: 0.65,
          marginTop: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span>Endpoint:</span>
        <code
          style={{
            background: 'rgba(0, 0, 0, 0.25)',
            padding: '2px 6px',
            borderRadius: 5,
            fontSize: 11.5,
          }}
        >
          {shown}
        </code>
        {status?.custom === true && (
          <span style={{ fontSize: 11, color: C.accent }}>(Custom Port)</span>
        )}
      </div>

      {!available && info.hint !== undefined && (
        <div
          style={{
            fontSize: 12,
            color: C.dim,
            marginTop: 8,
            lineHeight: 1.5,
            background: 'rgba(0, 0, 0, 0.15)',
            padding: '8px 10px',
            borderRadius: 8,
            borderLeft: `3px solid ${C.border}`,
          }}
        >
          {info.hint}
        </div>
      )}

      {editing && (
        <div
          style={{
            marginTop: 12,
            paddingTop: 12,
            borderTop: `1px solid ${C.border}`,
          }}
        >
          <span style={labelStyle}>Custom Server Address</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              style={monoInputStyle}
              placeholder={info.defaultBaseUrl}
              value={url}
              spellCheck={false}
              autoComplete="off"
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void apply(url);
              }}
            />
            <button style={primaryButton(busy)} disabled={busy} onClick={() => void apply(url)}>
              {busy ? 'Checking…' : 'Save Port'}
            </button>
          </div>
          <p style={{ margin: '6px 0 0', fontSize: 11.5, opacity: 0.55, lineHeight: 1.5 }}>
            {url.trim().length > 0 && normaliseBaseUrl(url) !== url.trim() ? (
              <>
                Will use <code>{normaliseBaseUrl(url)}</code>. Mochi adds the API path itself.
              </>
            ) : (
              <>
                Leave empty and click Save Port to reset to <code>{info.defaultBaseUrl}</code>.
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
}

export function AiSection(): JSX.Element {
  const [status, setStatus] = useState<LlmStatus | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Note>(null);
  const [scanning, setScanning] = useState(false);

  const [showAzure, setShowAzure] = useState(false);
  const [azureResource, setAzureResource] = useState('');
  const [azureDeployment, setAzureDeployment] = useState('');
  const [azureKey, setAzureKey] = useState('');
  const [azureBusy, setAzureBusy] = useState(false);
  const [azureMessage, setAzureMessage] = useState<Note>(null);

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
          text: `${providerLabel(result.provider)} connected successfully (${result.modelCount} models available)`,
        });
        setKeyInput('');
      } else {
        setMessage({
          ok: false,
          text: result.error ?? 'That key did not work. Please check your API key prefix.',
        });
      }
    } finally {
      setBusy(false);
    }
  }, [keyInput]);

  const saveAzure = useCallback(async () => {
    const resource = cleanAzureResourceName(azureResource);
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
          text: `Azure OpenAI connected, deployment "${deployment}" ready`,
        });
        setAzureKey('');
      } else {
        setAzureMessage({ ok: false, text: result.error ?? 'Azure credentials did not work.' });
      }
    } finally {
      setAzureBusy(false);
    }
  }, [azureResource, azureDeployment, azureKey]);

  const rescan = useCallback(async () => {
    setScanning(true);
    try {
      await window.mochi.llm.refresh();
    } finally {
      setScanning(false);
    }
  }, []);

  const runTest = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      const r = await window.mochi.llm.test();
      setMessage(
        r.ok
          ? { ok: true, text: `✓ Test passed. ${r.model}: "${r.text}" (${r.tokens} tokens)` }
          : { ok: false, text: `Test Failed: ${r.text}` },
      );
    } finally {
      setBusy(false);
    }
  }, []);

  if (status === null) return <div style={box}>Checking AI configuration…</div>;

  const capPct =
    status.dailyTokenCap > 0 ? Math.min(100, (status.spentToday / status.dailyTokenCap) * 100) : 0;
  const byId = new Map(status.local.map((l) => [l.provider, l]));
  const cloudKeys = status.configured.filter((c) => !byId.has(c.provider));

  return (
    <div style={{ ...box, display: 'flex', flexDirection: 'column', gap: 22 }}>
      {/* ---- Overall Status Banner ------------------------------------- */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 18px',
          borderRadius: 12,
          background: status.ready
            ? 'linear-gradient(135deg, rgba(168, 230, 184, 0.12) 0%, rgba(168, 230, 184, 0.04) 100%)'
            : 'rgba(255, 255, 255, 0.03)',
          border: status.ready ? '1px solid rgba(168, 230, 184, 0.35)' : `1px solid ${C.border}`,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: status.ready ? C.ok : C.warn,
                display: 'inline-block',
                boxShadow: status.ready ? `0 0 8px ${C.ok}` : 'none',
              }}
            />
            <strong style={{ fontSize: 15, color: '#ffffff' }}>
              {status.ready ? 'AI Companion Ready' : 'No AI Connected Yet'}
            </strong>
          </div>
          <div style={{ fontSize: 12.5, color: status.ready ? C.ok : C.warn, opacity: 0.9 }}>
            {status.ready
              ? `${status.models.length} model(s) ready across your connected providers`
              : 'Connect an API key below or launch Ollama / LM Studio to enable Mochi AI features.'}
          </div>
        </div>

        {status.ready && (
          <button
            style={ghostButton}
            onClick={() => void runTest()}
            disabled={busy}
            title="Send a quick test prompt to verify AI generation"
          >
            {busy ? 'Testing…' : '🧪 Test Connection'}
          </button>
        )}
      </div>

      {message && message.text.includes('Test Passed') && <NoteLine note={message} />}

      {/* ---- On this machine (Local Providers) ------------------------- */}
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            marginBottom: 4,
          }}
        >
          <span style={sectionTitle}>On This Machine (Local & Free)</span>
          <button style={ghostButton} onClick={() => void rescan()} disabled={scanning}>
            {scanning ? 'Scanning…' : 'Scan Again'}
          </button>
        </div>
        <p style={{ margin: '0 0 12px', fontSize: 12.5, color: C.dim, lineHeight: 1.5 }}>
          Run AI models locally on your computer. Zero cost, no API keys, and 100% private. Mochi
          detects running servers automatically.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {LOCAL_PROVIDERS.map((info) => (
            <LocalRuntimeRow key={info.id} info={info} status={byId.get(info.id)} />
          ))}
        </div>
      </div>

      {/* ---- Cloud API Providers ---------------------------------------- */}
      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 20 }}>
        <div style={{ marginBottom: 12 }}>
          <span style={sectionTitle}>Cloud API Providers</span>
          <div style={{ fontSize: 12.5, color: C.dim, marginTop: -4 }}>
            Connect your own API key for stronger reasoning or email drafting. Keys are saved
            encrypted on this device.
          </div>
        </div>

        {/* Connected Providers List with clear Remove buttons */}
        {cloudKeys.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div
              style={{
                fontSize: 12,
                letterSpacing: 0.5,
                textTransform: 'uppercase',
                opacity: 0.7,
                marginBottom: 10,
                color: C.ok,
                fontWeight: 650,
              }}
            >
              ✓ Active Connected Providers
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {cloudKeys.map((c) => (
                <div
                  key={c.provider}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '14px 16px',
                    borderRadius: 12,
                    border: '1px solid rgba(168, 230, 184, 0.35)',
                    background:
                      'linear-gradient(135deg, rgba(168, 230, 184, 0.08) 0%, rgba(168, 230, 184, 0.02) 100%)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        background: 'rgba(168, 230, 184, 0.15)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: C.ok,
                        fontWeight: 700,
                        fontSize: 16,
                      }}
                    >
                      ✓
                    </div>
                    <div>
                      <div style={{ fontSize: 14.5, fontWeight: 650, color: '#ffffff' }}>
                        {providerLabel(c.provider)}
                      </div>
                      <div style={{ fontSize: 12, color: C.ok, opacity: 0.9, marginTop: 3 }}>
                        Key saved:{' '}
                        <code
                          style={{
                            background: 'rgba(0,0,0,0.3)',
                            padding: '2px 6px',
                            borderRadius: 4,
                          }}
                        >
                          {c.redacted}
                        </code>
                      </div>
                    </div>
                  </div>

                  <button
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '8px 14px',
                      borderRadius: 9,
                      border: '1px solid rgba(255, 179, 193, 0.45)',
                      background: 'rgba(255, 179, 193, 0.08)',
                      color: '#ffb3c1',
                      fontSize: 12.5,
                      fontWeight: 650,
                      cursor: 'pointer',
                      transition: 'all 140ms ease',
                    }}
                    onClick={() => void window.mochi.llm.forgetKey(c.provider)}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 179, 193, 0.22)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 179, 193, 0.08)';
                    }}
                    title={`Disconnect and remove ${providerLabel(c.provider)} key`}
                  >
                    <span>🗑️</span>
                    <span>Remove Key</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Add New Key Form Box */}
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.02)',
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            padding: '16px 18px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 8,
            }}
          >
            <span style={{ fontSize: 13.5, fontWeight: 650, color: C.text }}>
              {cloudKeys.length > 0 ? 'Connect Another API Key' : 'Connect a Cloud API Key'}
            </span>
            <span
              style={{
                fontSize: 11.5,
                opacity: 0.6,
                background: 'rgba(255,255,255,0.06)',
                padding: '3px 8px',
                borderRadius: 6,
              }}
            >
              OpenAI · Anthropic · Google Gemini
            </span>
          </div>
          <p
            style={{
              margin: '0 0 14px',
              fontSize: 12.5,
              color: C.text,
              opacity: 0.65,
              lineHeight: 1.5,
            }}
          >
            Paste your API key below. Mochi detects the provider automatically from the key prefix (
            <code>sk-...</code>, <code>sk-ant-...</code>, or <code>AIza...</code>).
          </p>

          <div style={{ display: 'flex', gap: 10 }}>
            <input
              style={monoInputStyle}
              type="password"
              placeholder="Paste sk-..., sk-ant-..., or AIza... here"
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
              style={primaryButton(busy || keyInput.trim().length === 0)}
            >
              {busy ? 'Verifying…' : 'Connect Key'}
            </button>
          </div>
          <NoteLine note={message} />
        </div>

        {/* ---- Azure OpenAI Accordion ------------------------------------ */}
        <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 18, paddingTop: 14 }}>
          <button
            id="azure-toggle-btn"
            onClick={() => setShowAzure((v) => !v)}
            style={{
              background: 'transparent',
              border: 'none',
              color: C.accent,
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
            Azure OpenAI (Enterprise)
            {status.configured.some((c) => c.provider === 'azure') && (
              <span style={{ color: C.ok, fontWeight: 400 }}>· connected</span>
            )}
          </button>

          {showAzure && (
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 12, opacity: 0.7, lineHeight: 1.6 }}>
                Azure requires three values, not just an API key. Find them in{' '}
                <strong style={{ color: C.text }}>
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
                  Pasting the full endpoint is fine; Mochi extracts the resource name automatically.
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
                <p style={{ margin: '4px 0 0', fontSize: 11, opacity: 0.5 }}>
                  The name you assigned to the deployment in Azure Studio.
                </p>
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

              <NoteLine note={azureMessage} />

              <button
                id="azure-connect-btn"
                onClick={() => void saveAzure()}
                disabled={azureBusy || !azureResource || !azureDeployment || !azureKey}
                style={{
                  ...primaryButton(azureBusy || !azureResource || !azureDeployment || !azureKey),
                  alignSelf: 'flex-start',
                  fontSize: 13,
                }}
              >
                {azureBusy ? 'Validating…' : 'Connect Azure OpenAI'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ---- Usage Meter ----------------------------------------------- */}
      {status.ready && (
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
          <span style={labelStyle}>Today&apos;s Token Consumption</span>
          <div
            style={{ height: 6, borderRadius: 3, background: C.track, overflow: 'hidden' }}
            title={`${status.spentToday.toLocaleString()} of ${status.dailyTokenCap.toLocaleString()} tokens`}
          >
            <div
              style={{
                width: `${capPct}%`,
                height: '100%',
                background: capPct > 85 ? C.warn : C.accent,
                transition: 'width 250ms ease',
              }}
            />
          </div>
          <p style={{ margin: '6px 0 0', fontSize: 12, opacity: 0.55, lineHeight: 1.5 }}>
            <strong>{status.spentToday.toLocaleString()}</strong> /{' '}
            {status.dailyTokenCap === 0 ? 'unlimited' : status.dailyTokenCap.toLocaleString()}{' '}
            tokens used today. Local models are free and private; cloud providers bill directly from
            your own account.
          </p>
        </div>
      )}
    </div>
  );
}
