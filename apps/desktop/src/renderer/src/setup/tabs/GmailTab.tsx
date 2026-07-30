/**
 * GmailTab — Gmail inbox reader & LLM draft generator.
 *
 * Lets the user connect their Gmail via App Password, browse unread emails,
 * and generate + save AI-written reply drafts directly to Gmail Drafts.
 *
 * No Google Cloud required. Zero monthly fees.
 */

import { useState, useEffect, useCallback, type JSX } from 'react';
import type {
  CachedInboxItem,
  EmailCategory,
  GmailStatus,
  GmailSyncStatus,
  GmailTone,
} from '@mochi/core';
import { CATEGORIES } from '@mochi/core';
import { C, card, label, input, button, h2, sub } from '../ui.js';

type View = 'inbox' | 'draft';

interface DraftState {
  emailUid: number;
  subject: string;
  from: string;
  draftReply: string;
  suggestedSubject: string;
}

export function GmailTab(): JSX.Element {
  const [status, setStatus] = useState<GmailStatus | null>(null);
  const [emailInput, setEmailInput] = useState('');
  const [passInput, setPassInput] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const [emails, setEmails] = useState<readonly CachedInboxItem[]>([]);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<GmailSyncStatus | null>(null);
  const [sortMode, setSortMode] = useState<'priority' | 'recent'>('priority');

  // Primary only by default. Most unread mail is promotions, and every message
  // shown costs a full body download, so the default both looks better and is
  // several times faster.
  const [active, setActive] = useState<EmailCategory>('primary');
  const [counts, setCounts] = useState<ReadonlyMap<EmailCategory, number>>(new Map());

  const [view, setView] = useState<View>('inbox');
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [tone, setTone] = useState<GmailTone>('professional');
  const [savingDraft, setSavingDraft] = useState(false);
  const [savedOk, setSavedOk] = useState(false);

  const loadCached = useCallback(
    async (category: EmailCategory, sort: 'priority' | 'recent'): Promise<void> => {
      const all = await window.mochi.gmail.listCached({ sort, limit: 100 });
      setCounts(
        new Map(
          CATEGORIES.map((candidate) => [
            candidate.id,
            all.filter((email) => email.category === candidate.id).length,
          ]),
        ),
      );
      setEmails(all.filter((email) => email.category === category).slice(0, 25));
    },
    [],
  );

  useEffect(() => {
    let disposed = false;
    void window.mochi.gmail.status().then((next) => {
      if (disposed) return;
      setStatus(next);
      if (next.connected) {
        void loadCached('primary', 'priority');
        void window.mochi.gmail.refresh().then((sync) => {
          if (!disposed) setSyncStatus(sync);
        });
      }
    });
    return () => {
      disposed = true;
    };
  }, [loadCached]);

  useEffect(() => {
    const stopInbox = window.mochi.gmail.onInboxChanged(() => {
      void loadCached(active, sortMode);
    });
    const stopStatus = window.mochi.gmail.onSyncStatus(setSyncStatus);
    return () => {
      stopInbox();
      stopStatus();
    };
  }, [active, loadCached, sortMode]);

  const handleConnect = async (): Promise<void> => {
    setConnecting(true);
    setConnectError(null);
    const result = await window.mochi.gmail.connect(emailInput.trim(), passInput.trim());
    setConnecting(false);
    if (result.ok) {
      const newStatus = await window.mochi.gmail.status();
      setStatus(newStatus);
      setPassInput('');
    } else {
      setConnectError(result.error ?? 'Unknown error');
    }
  };

  const handleDisconnect = async (): Promise<void> => {
    await window.mochi.gmail.disconnect();
    const newStatus = await window.mochi.gmail.status();
    setStatus(newStatus);
    setEmails([]);
    setDraft(null);
    setView('inbox');
  };

  const handleFetch = useCallback(
    async (category: EmailCategory = active): Promise<void> => {
      setFetching(true);
      setFetchError(null);
      try {
        const next = await window.mochi.gmail.refresh();
        setSyncStatus(next);
        await loadCached(category, sortMode);
        if (next.lastError !== null) setFetchError(next.lastError);
      } catch {
        setFetchError('Failed to refresh Gmail.');
      } finally {
        setFetching(false);
      }
    },
    [active, loadCached, sortMode],
  );

  const selectCategory = (category: EmailCategory): void => {
    setActive(category);
    void loadCached(category, sortMode);
  };

  const handleGenerate = async (email: CachedInboxItem): Promise<void> => {
    setGenerating(true);
    setGenerateError(null);
    setView('draft');
    setDraft({
      emailUid: email.uid,
      subject: email.subject,
      from: email.replyToAddress || email.fromAddress,
      draftReply: '',
      suggestedSubject: `Re: ${email.subject}`,
    });

    const result = await window.mochi.gmail.generateAndSaveDraft(email.uid, tone);
    setGenerating(false);
    if (result.ok && result.draftReply) {
      setDraft({
        emailUid: email.uid,
        subject: email.subject,
        from: email.replyToAddress || email.fromAddress,
        draftReply: result.draftReply,
        suggestedSubject: result.suggestedSubject ?? `Re: ${email.subject}`,
      });
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 4000);
    } else {
      setGenerateError(result.error ?? 'Failed to generate draft.');
    }
  };

  const handleSaveDraft = async (): Promise<void> => {
    if (!draft) return;
    setSavingDraft(true);
    const result = await window.mochi.gmail.saveDraft({
      toEmail: draft.from,
      subject: draft.suggestedSubject,
      body: draft.draftReply,
    });
    setSavingDraft(false);
    if (result.ok) {
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 3000);
    } else {
      setGenerateError(result.error ?? 'Failed to save draft.');
    }
  };

  // ---- Not connected ----
  if (!status?.connected) {
    return (
      <div>
        <h2 style={h2}>Gmail Inbox</h2>
        <p style={sub}>
          Read emails & generate AI draft replies. Uses your Gmail App Password — no Google Cloud
          setup required.
        </p>

        <div style={{ ...card, maxWidth: 480 }}>
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 650, color: C.text }}>
              📋 Quick setup (30 seconds)
            </h3>
            <ol
              style={{
                margin: 0,
                paddingLeft: 18,
                fontSize: 12.5,
                color: C.dim,
                lineHeight: 1.8,
              }}
            >
              <li>
                Go to <strong style={{ color: C.accent }}>myaccount.google.com → Security</strong>
              </li>
              <li>
                Enable <strong style={{ color: C.text }}>2-Step Verification</strong>
              </li>
              <li>
                Search for <strong style={{ color: C.text }}>App Passwords</strong> → Create one
              </li>
              <li>Copy the 16-character code and paste below</li>
            </ol>
          </div>

          <div style={{ marginBottom: 14 }}>
            <span style={label}>Gmail Address</span>
            <input
              id="gmail-email-input"
              type="email"
              placeholder="you@gmail.com"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              style={input}
            />
          </div>

          <div style={{ marginBottom: 18 }}>
            <span style={label}>App Password (16 chars)</span>
            <input
              id="gmail-password-input"
              type="password"
              placeholder="abcd efgh ijkl mnop"
              value={passInput}
              onChange={(e) => setPassInput(e.target.value)}
              style={input}
            />
          </div>

          {connectError && (
            <div
              style={{
                background: 'rgba(255,100,100,0.12)',
                border: '1px solid rgba(255,100,100,0.25)',
                borderRadius: 9,
                padding: '9px 12px',
                fontSize: 12.5,
                color: C.warn,
                marginBottom: 14,
              }}
            >
              {connectError}
            </div>
          )}

          <button
            id="gmail-connect-btn"
            onClick={() => void handleConnect()}
            disabled={connecting || emailInput.length === 0 || passInput.length === 0}
            style={{
              ...button('primary'),
              width: '100%',
              opacity: connecting ? 0.6 : 1,
            }}
          >
            {connecting ? 'Testing connection…' : 'Connect Gmail'}
          </button>
        </div>
      </div>
    );
  }

  // ---- Draft view ----
  if (view === 'draft' && draft !== null) {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <button
            onClick={() => {
              setView('inbox');
              setDraft(null);
              setGenerateError(null);
            }}
            style={{ ...button('ghost'), padding: '6px 12px', fontSize: 12 }}
          >
            ← Back
          </button>
          <div>
            <h2 style={{ ...h2, fontSize: 16 }}>Draft Reply</h2>
            <p style={{ margin: 0, fontSize: 12, color: C.dim }}>
              To: {draft.from} · Re: {draft.subject}
            </p>
          </div>
        </div>

        {generating && (
          <div
            style={{
              ...card,
              textAlign: 'center',
              color: C.dim,
              fontSize: 13,
              padding: '32px 18px',
            }}
          >
            <div style={{ fontSize: 28, marginBottom: 10 }}>✦</div>
            Generating AI draft with your BYOK LLM…
          </div>
        )}

        {!generating && generateError && (
          <div
            style={{
              background: 'rgba(255,100,100,0.12)',
              border: '1px solid rgba(255,100,100,0.25)',
              borderRadius: 9,
              padding: '9px 12px',
              fontSize: 12.5,
              color: C.warn,
              marginBottom: 14,
            }}
          >
            {generateError}
          </div>
        )}

        {!generating && draft.draftReply.length > 0 && (
          <div>
            <div style={{ marginBottom: 14 }}>
              <span style={label}>Subject</span>
              <input
                type="text"
                value={draft.suggestedSubject}
                onChange={(e) => setDraft({ ...draft, suggestedSubject: e.target.value })}
                style={input}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <span style={label}>Draft Reply</span>
              <textarea
                value={draft.draftReply}
                onChange={(e) => setDraft({ ...draft, draftReply: e.target.value })}
                rows={12}
                style={{
                  ...input,
                  resize: 'vertical',
                  fontFamily: 'inherit',
                  lineHeight: 1.55,
                  minHeight: 200,
                }}
              />
            </div>

            {savedOk && (
              <div
                style={{
                  background: 'rgba(168,230,184,0.12)',
                  border: '1px solid rgba(168,230,184,0.3)',
                  borderRadius: 9,
                  padding: '9px 14px',
                  fontSize: 12.5,
                  color: C.good,
                  marginBottom: 12,
                }}
              >
                ✓ Draft saved to your Gmail Drafts folder!
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                id="gmail-save-draft-btn"
                onClick={() => void handleSaveDraft()}
                disabled={savingDraft}
                style={{
                  ...button('primary'),
                  opacity: savingDraft ? 0.6 : 1,
                }}
              >
                {savingDraft ? 'Saving…' : 'Save to Drafts'}
              </button>
              <button
                onClick={() =>
                  void handleGenerate({ ...emails.find((e) => e.uid === draft.emailUid)! })
                }
                style={button('ghost')}
              >
                Regenerate
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---- Connected + Inbox view ----
  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 18,
        }}
      >
        <div>
          <h2 style={h2}>Gmail Inbox</h2>
          <p style={{ margin: 0, fontSize: 12.5, color: C.dim }}>
            Connected as <strong style={{ color: C.accent }}>{status.email}</strong>
          </p>
          <p style={{ margin: '4px 0 0', fontSize: 11.5, color: C.faint }}>
            {syncStatus?.syncing
              ? 'Syncing inbox…'
              : syncStatus?.watching
                ? '● Live inbox'
                : syncStatus?.lastSyncedAt
                  ? `Last synced ${new Date(syncStatus.lastSyncedAt).toLocaleTimeString()}`
                  : 'Starting inbox sync…'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select
            id="gmail-sort-select"
            value={sortMode}
            onChange={(event) => {
              const next = event.target.value === 'recent' ? 'recent' : 'priority';
              setSortMode(next);
              void loadCached(active, next);
            }}
            style={{
              ...input,
              width: 'auto',
              padding: '6px 10px',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            <option value="priority">Priority</option>
            <option value="recent">Recent</option>
          </select>
          <select
            id="gmail-tone-select"
            value={tone}
            onChange={(e) => setTone(e.target.value as GmailTone)}
            style={{
              ...input,
              width: 'auto',
              padding: '6px 10px',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            <option value="professional">Professional</option>
            <option value="friendly">Friendly</option>
            <option value="brief">Brief</option>
          </select>
          <button
            id="gmail-fetch-btn"
            onClick={() => void handleFetch()}
            disabled={fetching}
            style={{ ...button('primary'), opacity: fetching ? 0.6 : 1, whiteSpace: 'nowrap' }}
          >
            {fetching ? 'Syncing…' : 'Refresh'}
          </button>
          <button
            onClick={() => void handleDisconnect()}
            style={{ ...button('ghost'), fontSize: 11.5, padding: '6px 10px' }}
          >
            Disconnect
          </button>
        </div>
      </div>

      {/*
       * Category chips. These are Gmail's own inbox tabs, read over IMAP via
       * the X-GM-RAW search extension — the same classification the user sees
       * in Gmail, not a guess of our own.
       *
       * Counts render even at zero so the row keeps a fixed width; a set of
       * controls that reflows while being clicked is worse than a "0".
       */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {CATEGORIES.map((c) => {
          const selected = c.id === active;
          const count = counts.get(c.id);
          return (
            <button
              key={c.id}
              onClick={() => selectCategory(c.id)}
              disabled={fetching}
              style={{
                ...button(selected ? 'primary' : 'ghost'),
                fontSize: 12,
                padding: '6px 11px',
                cursor: fetching ? 'default' : 'pointer',
                opacity: fetching && !selected ? 0.5 : 1,
              }}
            >
              {c.label}
              {count !== undefined && <span style={{ opacity: 0.65, marginLeft: 6 }}>{count}</span>}
            </button>
          );
        })}
      </div>

      {!CATEGORIES.find((c) => c.id === active)?.worthInterrupting && (
        <div style={{ ...sub, fontSize: 12, marginBottom: 14, color: C.dim }}>
          Mochi never interrupts you about this tab — you'll only see it here.
        </div>
      )}

      {fetchError && (
        <div
          style={{
            background: 'rgba(255,100,100,0.12)',
            border: '1px solid rgba(255,100,100,0.25)',
            borderRadius: 9,
            padding: '9px 12px',
            fontSize: 12.5,
            color: C.warn,
            marginBottom: 14,
          }}
        >
          {fetchError}
        </div>
      )}

      {emails.length === 0 && !fetching && (
        <div
          style={{
            ...card,
            textAlign: 'center',
            color: C.dim,
            fontSize: 13,
            padding: '40px 24px',
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 10 }}>📭</div>
          <div>
            Nothing unread in {CATEGORIES.find((c) => c.id === active)?.label ?? 'this tab'}.
          </div>
          <div style={{ fontSize: 12, marginTop: 5 }}>
            Pick another tab above, or click "Fetch Unread" to reload.
          </div>
        </div>
      )}

      {emails.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {emails.map((email) => (
            <div
              key={email.uid}
              style={{
                ...card,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: 12,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13.5,
                      fontWeight: 650,
                      color: C.text,
                      marginBottom: 3,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {email.subject || '(no subject)'}
                  </div>
                  <div style={{ fontSize: 12, color: C.dim }}>
                    From:{' '}
                    {email.fromName.length > 0
                      ? `${email.fromName} <${email.fromAddress}>`
                      : email.fromAddress}
                  </div>
                  <div style={{ fontSize: 11.5, color: C.faint, marginTop: 2 }}>
                    {new Date(email.receivedAt).toLocaleString()}
                  </div>
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-end',
                    flexDirection: 'column',
                    gap: 7,
                  }}
                >
                  <span
                    style={{
                      borderRadius: 999,
                      padding: '3px 8px',
                      fontSize: 10.5,
                      fontWeight: 650,
                      color:
                        email.priority?.tier === 'urgent'
                          ? '#ff8e8e'
                          : email.priority?.tier === 'review'
                            ? '#f0bd67'
                            : C.faint,
                      background:
                        email.priority?.tier === 'urgent'
                          ? 'rgba(255,80,80,0.12)'
                          : email.priority?.tier === 'review'
                            ? 'rgba(240,180,70,0.12)'
                            : 'rgba(255,255,255,0.04)',
                    }}
                  >
                    {email.priority?.tier === 'urgent'
                      ? '🔴 Urgent'
                      : email.priority?.tier === 'review'
                        ? '🟡 Review'
                        : email.priority === null
                          ? 'Scoring…'
                          : '⚪ Low'}
                  </span>
                  <button
                    id={`gmail-draft-btn-${email.uid}`}
                    onClick={() => void handleGenerate(email)}
                    style={{
                      ...button('primary'),
                      flexShrink: 0,
                      fontSize: 12,
                      padding: '7px 14px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    ✦ Draft Reply
                  </button>
                </div>
              </div>

              {email.priority !== null && (
                <div style={{ fontSize: 11.5, color: C.faint, fontStyle: 'italic' }}>
                  {email.priority.reason}
                </div>
              )}

              {email.snippet.length > 0 && (
                <div
                  style={{
                    fontSize: 12,
                    color: C.dim,
                    borderTop: `1px solid ${C.border}`,
                    paddingTop: 8,
                    maxHeight: 60,
                    overflow: 'hidden',
                    lineHeight: 1.5,
                  }}
                >
                  {email.snippet.slice(0, 200)}
                  {email.snippet.length > 200 ? '…' : ''}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
