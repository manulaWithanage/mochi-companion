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
 * Structured by *how a provider is configured*, not by provider, because those
 * are three genuinely different interactions and pretending otherwise is what
 * made this file sprawl:
 *
 * 1. **On this machine** — Ollama and LM Studio are detected, not configured.
 *    They get status rows, and the only control is which port to look on.
 * 2. **One paste** — OpenAI, Anthropic and Google are identified from the key
 *    prefix. Still one field, still no provider dropdown.
 * 3. **Structured credentials** — Azure needs three values, so it gets a form,
 *    tucked away because almost nobody needs it.
 *
 * The sections read `LOCAL_PROVIDERS` and `providerLabel` from core rather than
 * keeping their own copy of the list, so adding a runtime is a row in
 * PROVIDERS. Adding LM Studio here required no new component.
 *
 * The raw key goes straight to main and never comes back — everything shown
 * here is redacted (RULE 1).
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
};

const box: React.CSSProperties = {
  border: `1px solid ${C.border}`,
  borderRadius: 12,
  padding: '14px 16px',
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
  opacity: 0.5,
  marginBottom: 10,
};

const primaryButton = (disabled: boolean): React.CSSProperties => ({
  padding: '10px 16px',
  borderRadius: 10,
  border: 'none',
  background: C.accent,
  color: C.field,
  fontWeight: 600,
  fontSize: 14,
  cursor: disabled ? 'default' : 'pointer',
  opacity: disabled ? 0.5 : 1,
  whiteSpace: 'nowrap',
});

const ghostButton: React.CSSProperties = {
  background: 'transparent',
  border: `1px solid ${C.edge}`,
  color: C.text,
  borderRadius: 8,
  padding: '5px 12px',
  fontSize: 12,
  cursor: 'pointer',
};

type Note = { readonly ok: boolean; readonly text: string } | null;

const NoteLine = ({ note }: { note: Note }): JSX.Element | null =>
  note === null ? null : (
    <p style={{ margin: '8px 0 0', fontSize: 12, lineHeight: 1.5, color: note.ok ? C.ok : C.warn }}>
      {note.text}
    </p>
  );

/**
 * One local runtime: whether it answered, and where to look for it.
 *
 * The port field stays visible once opened even when the probe succeeds — a
 * user running LM Studio on a non-default port needs to confirm what Mochi is
 * actually reaching, not just be told it worked.
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
        border: `1px solid ${available ? 'rgba(168,230,184,0.3)' : C.border}`,
        background: available ? 'rgba(168,230,184,0.06)' : 'transparent',
        borderRadius: 10,
        padding: '10px 12px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 13, color: available ? C.ok : C.text, flex: 1 }}>
          <strong>{info.label}</strong>{' '}
          {available ? (
            <span style={{ opacity: 0.8 }}>
              — {status?.modelCount} model{status?.modelCount === 1 ? '' : 's'} ready
            </span>
          ) : (
            <span style={{ opacity: 0.5 }}>— not running</span>
          )}
        </span>

        <button style={ghostButton} onClick={() => setEditing((v) => !v)} disabled={busy}>
          {editing ? 'Close' : 'Port'}
        </button>
      </div>

      <div style={{ fontSize: 11.5, opacity: 0.55, marginTop: 4 }}>
        <code>{shown}</code>
        {status?.custom === true && ' (custom)'}
        {!available && status?.error !== undefined && ` — ${status.error}`}
      </div>

      {!available && info.hint !== undefined && (
        <div style={{ fontSize: 12, opacity: 0.6, marginTop: 6, lineHeight: 1.5 }}>{info.hint}</div>
      )}

      {editing && (
        <div style={{ marginTop: 10 }}>
          <span style={labelStyle}>Server address</span>
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
            <button
              style={primaryButton(busy)}
              disabled={busy}
              onClick={() => void apply(url)}
            >
              {busy ? 'Checking…' : 'Use'}
            </button>
          </div>
          <p style={{ margin: '6px 0 0', fontSize: 11.5, opacity: 0.5, lineHeight: 1.5 }}>
            {url.trim().length > 0 && normaliseBaseUrl(url) !== url.trim() ? (
              <>
                Will use <code>{normaliseBaseUrl(url)}</code> — Mochi adds the API path itself.
              </>
            ) : (
              <>
                Leave empty and press Use to go back to <code>{info.defaultBaseUrl}</code>.
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
          text: `${providerLabel(result.provider)} connected (${result.modelCount} models available)`,
        });
        setKeyInput('');
      } else {
        setMessage({ ok: false, text: result.error ?? 'That key did not work.' });
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
        setAzureMessage({ ok: true, text: `Azure OpenAI connected, deployment "${deployment}" ready` });
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
  const byId = new Map(status.local.map((l) => [l.provider, l]));
  const cloudKeys = status.configured.filter((c) => !byId.has(c.provider));

  return (
    <div style={{ ...box, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <strong style={{ fontSize: 15 }}>AI</strong>
        <span style={{ fontSize: 12, opacity: 0.6 }}>
          {status.ready ? `${status.models.length} model(s) ready` : 'not set up'}
        </span>
      </div>

      {/* ---- On this machine ------------------------------------------- */}
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <span style={sectionTitle}>On this machine</span>
          <button style={ghostButton} onClick={() => void rescan()} disabled={scanning}>
            {scanning ? 'Scanning…' : 'Scan again'}
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {LOCAL_PROVIDERS.map((info) => (
            <LocalRuntimeRow key={info.id} info={info} status={byId.get(info.id)} />
          ))}
        </div>

        <p style={{ margin: '10px 0 0', fontSize: 12, opacity: 0.6, lineHeight: 1.55 }}>
          {status.anyLocalAvailable
            ? 'Everything works already, no key and no account. Add a cloud key below only if you want a stronger model.'
            : 'Run either of these and Mochi works with no key at all. Both are free and stay on your machine.'}
        </p>
      </div>

      {/* ---- Cloud keys ------------------------------------------------ */}
      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
        <div style={sectionTitle}>Cloud providers</div>

        {cloudKeys.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
            {cloudKeys.map((c) => (
              <div
                key={c.provider}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <span style={{ fontSize: 13 }}>
                  {providerLabel(c.provider)}{' '}
                  <code style={{ opacity: 0.55, fontSize: 12 }}>{c.redacted}</code>
                </span>
                <button style={ghostButton} onClick={() => void window.mochi.llm.forgetKey(c.provider)}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        <span style={labelStyle}>Add a key (OpenAI / Anthropic / Google)</span>
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
            style={primaryButton(busy || keyInput.trim().length === 0)}
          >
            {busy ? 'Checking…' : 'Connect'}
          </button>
        </div>
        <p style={{ margin: '6px 0 0', fontSize: 11.5, opacity: 0.5 }}>
          Mochi works out which provider it is from the key itself.
        </p>
        <NoteLine note={message} />
      </div>

      {/* ---- Azure ----------------------------------------------------- */}
      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
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
          Azure OpenAI
          {status.configured.some((c) => c.provider === 'azure') && (
            <span style={{ color: C.ok, fontWeight: 400 }}>· connected</span>
          )}
        </button>

        {showAzure && (
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 12, opacity: 0.7, lineHeight: 1.6 }}>
              Azure needs three values, not just a key. Find them in{' '}
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
                Pasting the whole endpoint is fine, Mochi takes the name out of it.
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
                The name you gave the deployment, which is often not the model name.
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

      {/* ---- Test + usage ---------------------------------------------- */}
      {status.ready && (
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
          <button
            onClick={() => void runTest()}
            disabled={busy}
            style={{ ...ghostButton, padding: '6px 14px', fontSize: 13, marginBottom: 14 }}
          >
            {busy ? 'Asking…' : 'Test it'}
          </button>

          <span style={labelStyle}>Today&apos;s usage</span>
          <div
            style={{ height: 6, borderRadius: 3, background: C.track, overflow: 'hidden' }}
            title={`${status.spentToday.toLocaleString()} of ${status.dailyTokenCap.toLocaleString()} tokens`}
          >
            <div
              style={{
                width: `${capPct}%`,
                height: '100%',
                background: capPct > 85 ? C.warn : C.accent,
              }}
            />
          </div>
          <p style={{ margin: '6px 0 0', fontSize: 12, opacity: 0.55 }}>
            {status.spentToday.toLocaleString()} /{' '}
            {status.dailyTokenCap === 0 ? 'unlimited' : status.dailyTokenCap.toLocaleString()} tokens.
            Local models cost nothing; for cloud ones you pay your provider directly and Mochi never
            sees a bill.
          </p>
        </div>
      )}
    </div>
  );
}
