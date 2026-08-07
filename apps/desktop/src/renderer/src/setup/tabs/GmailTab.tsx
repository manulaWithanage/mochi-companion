/**
 * GmailTab — Gmail inbox reader & LLM draft generator.
 *
 * Lets the user connect their Gmail via App Password, browse unread emails,
 * and generate + save AI-written reply drafts directly to Gmail Drafts.
 *
 * No Google Cloud required. Zero monthly fees.
 */

import { useState, useEffect, useCallback, useRef, type JSX } from 'react';
import type {
  CachedInboxItem,
  EmailCategory,
  GmailAiSettings,
  GmailStatus,
  GmailSyncStatus,
  GmailTone,
} from '@mochi/core';
import { buildReplyQueue, matchesSearch, CATEGORIES } from '@mochi/core';
import { C, card, label, input, button, h2, sub } from '../ui.js';
import { GmailSettingsPanel } from './GmailSettingsPanel.js';
import { GmailRepliesPanel } from './GmailRepliesPanel.js';

type View = 'replies' | 'inbox' | 'draft' | 'settings';

interface DraftState {
  emailId: string;
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
  const [gmailSettings, setGmailSettings] = useState<GmailAiSettings | null>(null);

  // Primary only by default. Most unread mail is promotions, and every message
  // shown costs a full body download, so the default both looks better and is
  // several times faster.
  const [active, setActive] = useState<EmailCategory>('primary');
  const [counts, setCounts] = useState<ReadonlyMap<EmailCategory, number>>(new Map());
  /**
   * Every cached email, across categories.
   *
   * The reply queue is not per-category — a mail needing an answer is owed
   * whether Gmail filed it under Primary or Updates — and loadCached already
   * fetches the lot to compute the counts, so this costs no extra round trip.
   */
  const [allEmails, setAllEmails] = useState<readonly CachedInboxItem[]>([]);
  const [modelReady, setModelReady] = useState(false);
  const [search, setSearch] = useState('');
  // Ages are relative, so they go stale unless something re-renders.
  const [tick, setTick] = useState(() => Date.now());

  const [view, setView] = useState<View>('inbox');
  const landed = useRef(false);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [tone, setTone] = useState<GmailTone>('professional');
  const [savingDraft, setSavingDraft] = useState(false);
  const [savedOk, setSavedOk] = useState(false);

  const [expandedEmailId, setExpandedEmailId] = useState<string | null>(null);
  const [emailBodies, setEmailBodies] = useState<Record<string, string>>({});
  const [loadingBodyId, setLoadingBodyId] = useState<string | null>(null);

  const toggleExpand = async (email: CachedInboxItem): Promise<void> => {
    if (expandedEmailId === email.emailId) {
      setExpandedEmailId(null);
      return;
    }
    setExpandedEmailId(email.emailId);
    if (!emailBodies[email.emailId]) {
      setLoadingBodyId(email.emailId);
      try {
        const body = await window.mochi.gmail.fetchMessageBody(email.emailId);
        if (body) {
          setEmailBodies((prev) => ({ ...prev, [email.emailId]: body }));
        }
      } catch {
        /* fallback to snippet */
      } finally {
        setLoadingBodyId(null);
      }
    }
  };

  const loadCached = useCallback(
    async (category: EmailCategory, sort: 'priority' | 'recent'): Promise<void> => {
      const all = await window.mochi.gmail.listCached({ sort, limit: 100 });
      setAllEmails(all);
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
    void window.mochi.llm
      .status()
      .then((st) => setModelReady(st.ready))
      .catch(() => setModelReady(false));
    const clock = setInterval(() => setTick(Date.now()), 60_000);
    return () => clearInterval(clock);
  }, []);

  useEffect(() => {
    const apply = (settings: GmailAiSettings): void => {
      setGmailSettings(settings);
      setSortMode(settings.defaultSort);
      setTone(settings.defaultDraftTone);
    };
    void window.mochi.settings.get().then((settings) => apply(settings.gmailAi));
    return window.mochi.settings.onChange((settings) => apply(settings.gmailAi));
  }, []);

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
    if (
      gmailSettings?.deleteCachedDataOnDisconnect === true &&
      !window.confirm(
        'Disconnect Gmail and delete this account’s cached metadata, generated drafts, and reminders from this device?',
      )
    ) {
      return;
    }
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

  // Built from every cached email rather than the visible category: a reply is
  // owed regardless of which folder Gmail filed it in.
  const replyQueue = buildReplyQueue(allEmails, tick);

  /** The visible category, narrowed by the search box. */
  const shown = emails.filter((e) => matchesSearch(e, search));

  /*
   * Open on what needs answering, once.
   *
   * Guarded by a ref rather than run on every load: re-selecting the tab each
   * time the inbox syncs would drag the user out of whatever they were reading.
   * And only when the list is non-empty — landing on a blank checklist is a worse
   * first impression than landing on the inbox.
   */
  useEffect(() => {
    if (landed.current) return;
    if (allEmails.length === 0) return;
    landed.current = true;
    if (replyQueue.total > 0) setView('replies');
  }, [allEmails.length, replyQueue.total]);

  const handleGenerate = async (email: CachedInboxItem): Promise<void> => {
    setGenerating(true);
    setGenerateError(null);
    setView('draft');
    setDraft({
      emailId: email.emailId,
      emailUid: email.uid,
      subject: email.subject,
      from: email.replyToAddress || email.fromAddress,
      draftReply: '',
      suggestedSubject: `Re: ${email.subject}`,
    });

    const result = await window.mochi.gmail.generateDraft(email.emailId, tone);
    setGenerating(false);
    if (result.ok && result.draftReply) {
      setDraft({
        emailId: email.emailId,
        emailUid: email.uid,
        subject: email.subject,
        from: email.replyToAddress || email.fromAddress,
        draftReply: result.draftReply,
        suggestedSubject: result.suggestedSubject ?? `Re: ${email.subject}`,
      });
      await loadCached(active, sortMode);
    } else {
      setGenerateError(result.error ?? 'Failed to generate draft.');
    }
  };

  const handleSaveDraft = async (): Promise<void> => {
    if (!draft) return;
    setSavingDraft(true);
    const result = await window.mochi.gmail.saveGeneratedDraft(
      draft.emailId,
      draft.suggestedSubject,
      draft.draftReply,
    );
    setSavingDraft(false);
    if (result.ok) {
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 3000);
    } else {
      setGenerateError(result.error ?? 'Failed to save draft.');
    }
  };

  const handleSnoozeReminder = async (emailId: string): Promise<void> => {
    await window.mochi.gmail.snoozeReminder(emailId, 60);
    await loadCached(active, sortMode);
  };

  const handleDismissReminder = async (emailId: string): Promise<void> => {
    await window.mochi.gmail.dismissReminder(emailId);
    await loadCached(active, sortMode);
  };

  const handleSaveSettings = async (next: GmailAiSettings): Promise<void> => {
    const settings = await window.mochi.settings.setGmailAi(next);
    setGmailSettings(settings.gmailAi);
    setSortMode(settings.gmailAi.defaultSort);
    setTone(settings.gmailAi.defaultDraftTone);
    await loadCached(active, settings.gmailAi.defaultSort);
  };

  const handleClearLocalData = async (): Promise<number> => {
    const deleted = await window.mochi.gmail.clearLocalData();
    setEmails([]);
    setDraft(null);
    return deleted;
  };

  const openDraft = (email: CachedInboxItem): void => {
    if (
      email.draft?.status === 'ready' &&
      email.draft.body !== null &&
      email.draft.subject !== null
    ) {
      setDraft({
        emailId: email.emailId,
        emailUid: email.uid,
        subject: email.subject,
        from: email.replyToAddress || email.fromAddress,
        draftReply: email.draft.body,
        suggestedSubject: email.draft.subject,
      });
      setGenerateError(null);
      setSavedOk(false);
      setView('draft');
      return;
    }
    void handleGenerate(email);
  };

  // ---- Not connected ----
  if (!status?.connected) {
    return (
      <div>
        <h2 style={h2}>Gmail Inbox</h2>
        <p style={sub}>
          Read emails & generate AI draft replies. Uses your Gmail App Password, so no Google Cloud
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
            {/* Tone Selector Pills Bar */}
            <div style={{ marginBottom: 14 }}>
              <span style={label}>AI Draft Tone</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {/*
                  Typed against GmailTone rather than cast to it. Two of these
                  pills once carried ids ('concise', 'assertive') outside the
                  type, which main coerced to 'professional' — so they
                  highlighted a choice while producing professional drafts.
                  'Short & Sweet' is the existing 'brief' tone under a
                  friendlier label; same instruction, so no near-duplicate id.
                */}
                {(
                  [
                    { id: 'professional', label: '💼 Professional' },
                    { id: 'brief', label: '⚡ Short & Sweet' },
                    { id: 'friendly', label: '☕ Friendly' },
                    { id: 'assertive', label: '💪 Firm' },
                  ] as readonly { id: GmailTone; label: string }[]
                ).map((item) => {
                  const activeTone = tone === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        const newTone = item.id;
                        setTone(newTone);
                        // allEmails, not the visible category's list: drafts
                        // also open from the Needs Reply queue, whose mail may
                        // sit in a category that is not on screen.
                        const targetEmail = allEmails.find((e) => e.uid === draft.emailUid);
                        if (targetEmail) {
                          void window.mochi.gmail
                            .generateDraft(targetEmail.emailId, newTone)
                            .then((res) => {
                              if (res.ok && res.draftReply) {
                                setDraft((prev) =>
                                  prev ? { ...prev, draftReply: res.draftReply! } : null,
                                );
                              } else if (!res.ok) {
                                setGenerateError(res.error ?? 'Failed to generate draft.');
                              }
                            })
                            .catch(() => setGenerateError('Failed to generate draft.'));
                        }
                      }}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 8,
                        border: activeTone
                          ? `1.5px solid ${C.accent}`
                          : '1px solid rgba(255, 255, 255, 0.1)',
                        background: activeTone
                          ? 'rgba(242, 166, 179, 0.2)'
                          : 'rgba(255, 255, 255, 0.04)',
                        color: activeTone ? '#ffffff' : C.text,
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'all 140ms ease',
                      }}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

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
                onClick={() => {
                  // allEmails, not the visible category's list — same reason
                  // as the tone pills above. The old `emails.find(...)!` spread
                  // undefined for Needs Reply mail and hung the generate call.
                  const source = allEmails.find((e) => e.uid === draft.emailUid);
                  if (source) void handleGenerate(source);
                  else setGenerateError('This email is no longer in the local cache. Refresh and try again.');
                }}
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

  const connectedHeader = (
    <>
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

      <div
        style={{
          display: 'flex',
          gap: 4,
          borderBottom: `1px solid ${C.border}`,
          marginBottom: 16,
        }}
      >
        {(['replies', 'inbox', 'settings'] as const).map((tab) => {
          const selected = view === tab;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setView(tab)}
              style={{
                border: 'none',
                borderBottom: selected ? `2px solid ${C.accent}` : '2px solid transparent',
                background: 'transparent',
                color: selected ? C.text : C.dim,
                padding: '8px 14px 10px',
                fontSize: 12.5,
                fontWeight: selected ? 650 : 500,
                cursor: 'pointer',
              }}
            >
              {tab === 'replies' ? 'Needs Reply' : tab === 'inbox' ? 'Inbox' : 'Settings'}
              {tab === 'replies' && replyQueue.total > 0 && (
                <span
                  style={{
                    marginLeft: 7,
                    fontSize: 11,
                    fontWeight: 650,
                    padding: '1px 6px',
                    borderRadius: 999,
                    background: selected ? C.accent : 'rgba(242, 166, 179, 0.18)',
                    color: selected ? '#1a1420' : C.accent,
                  }}
                >
                  {replyQueue.total}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </>
  );

  if (view === 'replies') {
    return (
      <div>
        {connectedHeader}
        <GmailRepliesPanel
          queue={replyQueue}
          cachedCount={allEmails.length}
          modelReady={modelReady}
          findEmail={(id) => allEmails.find((e) => e.emailId === id)}
          onDraft={openDraft}
          onHandled={(id) => void handleDismissReminder(id)}
          onSnooze={(id) => void handleSnoozeReminder(id)}
        />
      </div>
    );
  }

  if (view === 'settings') {
    return (
      <div>
        {connectedHeader}
        {gmailSettings === null ? (
          <div style={card}>Loading Gmail settings…</div>
        ) : (
          <GmailSettingsPanel
            value={gmailSettings}
            onSave={handleSaveSettings}
            onClearLocalData={handleClearLocalData}
          />
        )}
      </div>
    );
  }

  // ---- Connected + Inbox view ----

  return (
    <div>
      {connectedHeader}

      {/*
        A pointer to the Needs Reply tab, not a command centre.

        This was a hero "EXECUTIVE AI ACTION DECK" claiming an "Estimated
        response time" of count x 3 minutes — a number nothing measured — above a
        button labelled "Auto-Draft All Urgent (6)" that called slice(0, 3) and
        drafted three. An inbox is for reading mail; what you owe a reply to is
        its own list one tab over.
      */}
      {replyQueue.total > 0 && (
        <div
          style={{
            ...card,
            marginBottom: 14,
            padding: '11px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <span style={{ fontSize: 12.5, color: C.dim }}>
            {replyQueue.total} {replyQueue.total === 1 ? 'reply is' : 'replies are'} waiting on you.
          </span>
          <button
            type="button"
            onClick={() => setView('replies')}
            style={{
              ...button('ghost'),
              padding: '5px 12px',
              fontSize: 11.5,
              whiteSpace: 'nowrap',
            }}
          >
            Open Needs Reply
          </button>
        </div>
      )}

      {/*
        Search over what is cached, filtering as you type.
        There was no way to look for a specific message — you could pick a Gmail
        category and scroll, which is not the same as finding the one from Priya
        about the invoice.
      */}
      <input
        style={{ ...input, marginBottom: 10 }}
        type="search"
        placeholder="Search cached mail by subject or sender…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        aria-label="Search cached mail"
      />

      {/* Category & Filter Tabs */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {/*
          Empty categories are hidden. "Forums 0" is a button that does nothing
          taking up the same room as one that does, and the point of this row is
          to be scannable. The selected one always stays, or clicking through to
          an empty category would make its own tab vanish under the cursor.
        */}
        {CATEGORIES.filter((c) => c.id === active || (counts.get(c.id) ?? 0) > 0).map((c) => {
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
          Mochi never interrupts you about this tab. You'll only see it here.
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
            Pick another tab above, or click "Refresh" to sync latest emails.
          </div>
        </div>
      )}

      {search.trim().length > 0 && (
        <div style={{ fontSize: 11.5, color: C.faint, marginBottom: 10 }}>
          {/*
            Bounded honestly. This searches what Mochi has cached, not the whole
            mailbox, so an empty result must not imply the mail does not exist.
          */}
          {shown.length} of {emails.length} cached {emails.length === 1 ? 'message' : 'messages'} in
          this category match “{search.trim()}”.
        </div>
      )}
      {shown.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {shown.map((email) => {
            const isExpanded = expandedEmailId === email.emailId;
            const fullBody = emailBodies[email.emailId];
            const isLoadingBody = loadingBodyId === email.emailId;

            return (
              <div
                key={email.uid}
                style={{
                  ...card,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  border: `1px solid ${isExpanded ? C.accent : 'rgba(255, 255, 255, 0.1)'}`,
                  transition: 'all 160ms ease',
                  background:
                    email.priority?.tier === 'urgent' ? 'rgba(40, 26, 38, 0.85)' : undefined,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: 12,
                    cursor: 'pointer',
                  }}
                  onClick={() => void toggleExpand(email)}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: C.text,
                        marginBottom: 3,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: isExpanded ? 'normal' : 'nowrap',
                      }}
                    >
                      {email.subject || '(no subject)'}
                    </div>
                    <div style={{ fontSize: 12, color: C.dim }}>
                      From:{' '}
                      <strong style={{ color: C.text }}>
                        {email.fromName.length > 0 ? email.fromName : email.fromAddress}
                      </strong>{' '}
                      <span style={{ opacity: 0.6 }}>&lt;{email.fromAddress}&gt;</span>
                    </div>
                    <div style={{ fontSize: 11, color: C.faint, marginTop: 2 }}>
                      🕒 {new Date(email.receivedAt).toLocaleString()}
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
                        padding: '3px 9px',
                        fontSize: 10.5,
                        fontWeight: 750,
                        color:
                          email.priority?.tier === 'urgent'
                            ? '#ff8e8e'
                            : email.priority?.tier === 'review'
                              ? '#f0bd67'
                              : C.faint,
                        background:
                          email.priority?.tier === 'urgent'
                            ? 'rgba(255,80,80,0.18)'
                            : email.priority?.tier === 'review'
                              ? 'rgba(240,180,70,0.18)'
                              : 'rgba(255,255,255,0.06)',
                      }}
                    >
                      {email.priority?.tier === 'urgent'
                        ? '🔴 Urgent Reply'
                        : email.priority?.tier === 'review'
                          ? '🟡 Review Request'
                          : email.priority === null
                            ? 'Scoring…'
                            : '⚪ Low Priority'}
                    </span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void toggleExpand(email);
                        }}
                        style={{ ...button('ghost'), fontSize: 11.5, padding: '5px 9px' }}
                      >
                        {isExpanded ? '▲ Hide' : '👁 Read'}
                      </button>
                      {/*
                        Closes the loop: Mochi could say a mail mattered and had
                        no way to take you to it.
                      */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          void window.mochi.gmail.openThread(email.threadId);
                        }}
                        title="Open this conversation in Gmail"
                        style={{
                          ...button('ghost'),
                          flexShrink: 0,
                          fontSize: 12,
                          padding: '6px 10px',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Open
                      </button>
                      <button
                        id={`gmail-draft-btn-${email.uid}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          openDraft(email);
                        }}
                        disabled={
                          email.draft?.status === 'queued' || email.draft?.status === 'generating'
                        }
                        style={{
                          ...button('primary'),
                          flexShrink: 0,
                          fontSize: 12,
                          padding: '6px 12px',
                          whiteSpace: 'nowrap',
                          opacity:
                            email.draft?.status === 'queued' || email.draft?.status === 'generating'
                              ? 0.6
                              : 1,
                        }}
                      >
                        {email.draft?.status === 'ready'
                          ? '✦ Draft Ready'
                          : email.draft?.status === 'queued' || email.draft?.status === 'generating'
                            ? 'Preparing…'
                            : '✦ Draft Reply'}
                      </button>
                    </div>
                  </div>
                </div>

                {/*
                  One quiet line, not a callout.

                  This was an accent-bordered "💡 AI Insights" panel on every
                  row, which at six rows is six highlighted boxes competing with
                  the mail itself. The weight was the problem rather than the
                  text: a rules-based reason is a useful signal list ("sent
                  directly to you, asks you to take action"), while the LLM path
                  sometimes writes prose that merely restates the subject —
                  "Urgent request for immediate attention" above "Urgent: action
                  required now".

                  Filtering the vacuous ones was tried and abandoned: telling a
                  paraphrase from a genuine summary needs to understand the
                  sentence, and a word-overlap rule confidently got that exact
                  case wrong. Showing it quietly costs one dim line when it is
                  useless and still reads fine when it is not.
                */}
                {email.priority?.reason !== undefined && email.priority.reason.length > 0 && (
                  <div style={{ fontSize: 11.5, color: C.faint, lineHeight: 1.45 }}>
                    {email.priority.reason}
                  </div>
                )}

                {/*
                  Three chips lived here — "Confirm & Approve", "Schedule & Time
                  Check", "Ask for Details" — each carrying an `intent` string
                  that nothing ever read. All three called openDraft(email) and
                  produced the same draft, so the UI promised a choice it could
                  not keep. Reply styles belong inside the draft screen, after
                  you have decided to reply, not as three buttons on every row.
                */}
                {email.priority?.replyLikely === true &&
                  email.priority.confidence >= 0.75 &&
                  email.priority.tier !== 'low' &&
                  email.reminder?.state !== 'replied' &&
                  email.reminder?.state !== 'dismissed' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                      <span style={{ fontSize: 11, color: C.faint }}>
                        {email.reminder?.snoozedUntil
                          ? `Snoozed until ${new Date(email.reminder.snoozedUntil).toLocaleTimeString()}`
                          : 'Reply reminder active'}
                      </span>
                      <button
                        onClick={() => void handleSnoozeReminder(email.emailId)}
                        style={{ ...button('ghost'), padding: '3px 7px', fontSize: 10.5 }}
                      >
                        Snooze 1h
                      </button>
                      <button
                        onClick={() => void handleDismissReminder(email.emailId)}
                        style={{ ...button('ghost'), padding: '3px 7px', fontSize: 10.5 }}
                      >
                        Dismiss
                      </button>
                    </div>
                  )}

                {/* Collapsed Snippet View */}
                {!isExpanded && email.snippet.length > 0 && (
                  <div
                    onClick={() => void toggleExpand(email)}
                    style={{
                      fontSize: 12,
                      color: C.dim,
                      borderTop: `1px solid ${C.border}`,
                      paddingTop: 8,
                      cursor: 'pointer',
                      lineHeight: 1.5,
                    }}
                  >
                    {email.snippet.slice(0, 180)}
                    {email.snippet.length > 180 ? '… (click to read full message)' : ''}
                  </div>
                )}

                {/* Expanded Full Email Body View */}
                {isExpanded && (
                  <div
                    style={{
                      borderTop: `1px solid ${C.border}`,
                      paddingTop: 12,
                      marginTop: 4,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                    }}
                  >
                    <div>
                      <div
                        style={{ fontSize: 11, color: C.faint, fontWeight: 650, marginBottom: 6 }}
                      >
                        📩 EMAIL BODY CONTENT
                      </div>
                      {isLoadingBody ? (
                        <div
                          style={{
                            fontSize: 12,
                            color: C.dim,
                            fontStyle: 'italic',
                            padding: '10px 0',
                          }}
                        >
                          ⚡ Fetching message body from Gmail…
                        </div>
                      ) : (
                        <div
                          style={{
                            background: '#16121e',
                            border: `1px solid ${C.border}`,
                            borderRadius: 8,
                            padding: '12px 14px',
                            fontSize: 12.5,
                            color: C.text,
                            lineHeight: 1.6,
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            maxHeight: 350,
                            overflowY: 'auto',
                            fontFamily: 'inherit',
                          }}
                        >
                          {fullBody || email.snippet || '(No body content)'}
                        </div>
                      )}
                    </div>

                    {/* AI Prepared Draft Preview (if available) */}
                    {email.draft?.status === 'ready' && email.draft.body && (
                      <div
                        style={{
                          background: 'rgba(255, 140, 170, 0.08)',
                          border: `1px solid ${C.accent}`,
                          borderRadius: 8,
                          padding: '12px 14px',
                        }}
                      >
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 650,
                            color: C.accent,
                            marginBottom: 4,
                          }}
                        >
                          ✦ MOCHI PREPARED DRAFT REPLY
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            color: C.text,
                            fontStyle: 'italic',
                            lineHeight: 1.5,
                            marginBottom: 8,
                          }}
                        >
                          "{email.draft.body}"
                        </div>
                        <button
                          onClick={() => openDraft(email)}
                          style={{ ...button('primary'), fontSize: 11.5, padding: '5px 11px' }}
                        >
                          ✦ Open & Edit Draft
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
