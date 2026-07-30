import { useCallback, useEffect, useState, type JSX } from 'react';
import type { CalendarStatus, GoogleStatus } from '@mochi/core';
import { button, C, card, h2, input, label, sub } from '../ui.js';
import { GoogleWizard } from '../GoogleWizard.js';

/**
 * Connections, and what each one unlocks.
 *
 * Note what is deliberately absent: there is no Mochi account. Connecting a
 * calendar authorises *Google* to share it with this app, on this machine. It
 * does not create an account with us, because there is no us to have one with.
 *
 * **The secret address leads, the Cloud project is Advanced.** Both end up as
 * the same events, but one is a single paste and the other is a five-step
 * wizard with a consent screen and a publishing step that expires tokens after
 * seven days if skipped. Read-only is what almost everyone wants, so the
 * ten-minute path should not be the first thing offered.
 */

const Pill = ({ on, text }: { readonly on: boolean; readonly text: string }): JSX.Element => (
  <span
    style={{
      fontSize: 11,
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      color: on ? C.good : C.faint,
      border: `1px solid ${on ? 'rgba(168,230,184,0.35)' : C.border}`,
      borderRadius: 999,
      padding: '2px 9px',
      whiteSpace: 'nowrap',
    }}
  >
    {text}
  </span>
);

/** `just now`, `4 min ago`, `2 hours ago`. */
function sinceLabel(at: number | null): string {
  if (at === null) return 'never';
  const ms = Date.now() - at;
  if (ms < 60_000) return 'just now';
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
}

function CalendarCard(): JSX.Element {
  const [status, setStatus] = useState<CalendarStatus | null>(null);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    void window.mochi.calendar.status().then(setStatus);
    return window.mochi.calendar.onChange(setStatus);
  }, []);

  const connect = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      // Reuse the Gmail address when there is one, so Mochi can tell *your*
      // RSVP from the other attendees' and hide meetings you declined. Asking
      // for it again as a second field would be friction for the same answer.
      let selfEmail: string | undefined;
      try {
        selfEmail = (await window.mochi.gmail.status()).email ?? undefined;
      } catch {
        selfEmail = undefined;
      }

      const result = await window.mochi.calendar.connect(url, selfEmail);
      if (result.ok) {
        setUrl('');
        setNote(`Connected. ${result.eventCount ?? 0} event(s) in the next three weeks.`);
      } else {
        setError(result.error ?? 'That calendar could not be loaded.');
      }
    } finally {
      setBusy(false);
    }
  }, [url]);

  const connected = status?.connected === true;

  return (
    <div style={{ ...card, marginBottom: 12 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 6,
        }}
      >
        <strong style={{ fontSize: 14 }}>Calendar</strong>
        <Pill on={connected} text={connected ? 'connected' : 'not connected'} />
      </div>

      <div style={{ fontSize: 12.5, color: C.text, marginBottom: 6 }}>
        Your next meeting · morning briefing · one-click join
      </div>

      {connected ? (
        <>
          <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.7, marginBottom: 12 }}>
            <code style={{ color: C.text }}>{status?.redacted}</code>
            <br />
            {status?.eventCount ?? 0} event(s) · checked {sinceLabel(status?.lastSyncAt ?? null)}
            {status?.syncing === true && ' · checking…'}
          </div>

          {status?.error !== undefined && (
            <div
              style={{
                fontSize: 12,
                color: C.warn,
                background: 'rgba(255,179,193,0.08)',
                border: '1px solid rgba(255,179,193,0.2)',
                borderRadius: 8,
                padding: '8px 10px',
                marginBottom: 12,
                lineHeight: 1.55,
              }}
            >
              {status.error}
              <div style={{ opacity: 0.75, marginTop: 4 }}>
                Showing the last events Mochi managed to load.
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              style={button('ghost')}
              disabled={status?.syncing === true}
              onClick={() => void window.mochi.calendar.refresh()}
            >
              {status?.syncing === true ? 'Checking…' : 'Check now'}
            </button>
            <button style={button('ghost')} onClick={() => void window.mochi.calendar.disconnect()}>
              Disconnect
            </button>
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.6, marginBottom: 12 }}>
            In Google Calendar open <strong style={{ color: C.text }}>Settings</strong>, pick your
            calendar, scroll to <strong style={{ color: C.text }}>Secret address in iCal format</strong>{' '}
            and copy it. Read-only, no setup, nothing to publish.
          </div>

          <span style={label}>Secret iCal address</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              style={{
                ...input,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: 12.5,
              }}
              type="password"
              placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
              value={url}
              spellCheck={false}
              autoComplete="off"
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void connect();
              }}
            />
            <button
              style={{ ...button('primary'), whiteSpace: 'nowrap' }}
              disabled={busy || url.trim().length === 0}
              onClick={() => void connect()}
            >
              {busy ? 'Checking…' : 'Connect'}
            </button>
          </div>

          <p style={{ margin: '6px 0 0', fontSize: 11.5, color: C.faint, lineHeight: 1.55 }}>
            Treat this like a password: anyone with the link can read the calendar. Mochi encrypts
            it and never sends it anywhere but Google.
          </p>
        </>
      )}

      {error !== null && (
        <p style={{ margin: '10px 0 0', fontSize: 12, color: C.warn, lineHeight: 1.55 }}>{error}</p>
      )}
      {note !== null && <p style={{ margin: '10px 0 0', fontSize: 12, color: C.good }}>{note}</p>}
    </div>
  );
}

function AdvancedGoogleCard(): JSX.Element {
  const [status, setStatus] = useState<GoogleStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [wizard, setWizard] = useState(false);

  useEffect(() => {
    void window.mochi.google.status().then(setStatus);
    return window.mochi.google.onChange(setStatus);
  }, []);

  if (wizard) {
    return <GoogleWizard onDone={() => setWizard(false)} onCancel={() => setWizard(false)} />;
  }

  return (
    <div style={{ ...card, marginBottom: 12 }}>
      <button
        onClick={() => setOpen((v) => !v)}
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
        <span style={{ fontSize: 11 }}>{open ? '▾' : '▸'}</span>
        Advanced: your own Google Cloud project
        {status?.connected === true && (
          <span style={{ color: C.good, fontWeight: 400 }}>· connected</span>
        )}
      </button>

      {open && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.6, marginBottom: 12 }}>
            Full API access rather than a read-only feed, so Mochi can create and change events as
            well as read them. About ten minutes: you create your own Cloud project and act as your
            own developer, which is why it needs no verification and costs nothing.
          </div>

          {status?.connected === true ? (
            <button style={button('ghost')} onClick={() => void window.mochi.google.disconnect()}>
              Disconnect
            </button>
          ) : (
            <button style={button('ghost')} onClick={() => setWizard(true)}>
              Start the wizard
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function ConnectionsTab(): JSX.Element {
  return (
    <div>
      <h2 style={h2}>Connections</h2>
      <p style={sub}>Optional. Mochi tracks time and keeps you company without any of these.</p>

      <div
        style={{
          ...card,
          marginBottom: 16,
          borderColor: 'rgba(168, 230, 184, 0.25)',
          background: 'rgba(168, 230, 184, 0.06)',
        }}
      >
        <div style={{ fontSize: 13, color: C.good, fontWeight: 600, marginBottom: 4 }}>
          No account needed
        </div>
        <div style={{ fontSize: 12.5, color: C.dim, lineHeight: 1.6 }}>
          There is no Mochi login, because there is no Mochi server. Connecting a calendar
          authorises <em>Google</em> to share it with this app, on this machine. Your data, your
          keys and your history never leave it.
        </div>
      </div>

      <CalendarCard />
      <AdvancedGoogleCard />

      <div style={card}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 6,
          }}
        >
          <strong style={{ fontSize: 14 }}>Email</strong>
          <Pill on text="in the Gmail tab" />
        </div>
        <div style={{ fontSize: 12.5, color: C.text, marginBottom: 6 }}>
          Urgent-mail triage · AI reply drafts
        </div>
        <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.55 }}>
          Set up with an app password over IMAP, which works with any provider and needs no Google
          Cloud project at all.
        </div>
      </div>
    </div>
  );
}
