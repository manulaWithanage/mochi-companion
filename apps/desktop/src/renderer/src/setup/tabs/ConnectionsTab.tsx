import { useEffect, useState, type JSX } from 'react';
import type { GoogleStatus } from '@mochi/core';
import { button, C, card, h2, sub } from '../ui.js';
import { GoogleWizard } from '../GoogleWizard.js';

/**
 * Google, and what it unlocks.
 *
 * Note what is deliberately absent: there is no Mochi account. Connecting
 * Google authorises Google to share data with the app on this machine. It
 * does not create an account with us, because there is no us to have one
 * with — no server, no database, nothing to sign into.
 */

export function ConnectionsTab(): JSX.Element {
  const [status, setStatus] = useState<GoogleStatus | null>(null);
  const [wizard, setWizard] = useState(false);

  useEffect(() => {
    void window.mochi.google.status().then(setStatus);
    return window.mochi.google.onChange(setStatus);
  }, []);

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
          There is no Mochi login, because there is no Mochi server. Connecting Google authorises{' '}
          <em>Google</em> to share your calendar with this app, on this machine. Your data, your
          keys and your history never leave it.
        </div>
      </div>

      {wizard ? (
        <GoogleWizard onDone={() => setWizard(false)} onCancel={() => setWizard(false)} />
      ) : (
        <div style={{ ...card, marginBottom: 12 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 6,
            }}
          >
            <strong style={{ fontSize: 14 }}>Google Calendar</strong>
            <span
              style={{
                fontSize: 11,
                letterSpacing: 0.4,
                textTransform: 'uppercase',
                color: status?.connected === true ? C.good : C.faint,
                border: `1px solid ${status?.connected === true ? 'rgba(168,230,184,0.35)' : C.border}`,
                borderRadius: 999,
                padding: '2px 9px',
              }}
            >
              {status?.connected === true ? 'connected' : 'not connected'}
            </span>
          </div>

          <div style={{ fontSize: 12.5, color: C.text, marginBottom: 6 }}>
            Morning briefing · meeting alerts · one-click join
          </div>
          <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.55, marginBottom: 12 }}>
            Read-only, and only your calendar. You create your own Google Cloud project, so nothing
            is shared with Mochi as a project — you are your own developer, which is why this needs
            no verification and costs nothing.
          </div>

          {status?.connected === true ? (
            <button style={button('ghost')} onClick={() => void window.mochi.google.disconnect()}>
              Disconnect
            </button>
          ) : (
            <button style={button('primary')} onClick={() => setWizard(true)}>
              Connect — about 10 minutes
            </button>
          )}
        </div>
      )}

      <div style={{ ...card, opacity: 0.7 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 6,
          }}
        >
          <strong style={{ fontSize: 14 }}>Email</strong>
          <span
            style={{
              fontSize: 11,
              letterSpacing: 0.4,
              textTransform: 'uppercase',
              color: C.faint,
              border: `1px solid ${C.border}`,
              borderRadius: 999,
              padding: '2px 9px',
            }}
          >
            coming soon
          </span>
        </div>
        <div style={{ fontSize: 12.5, color: C.text, marginBottom: 6 }}>Urgent-mail triage</div>
        <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.55 }}>
          IMAP with an app password works with any provider and needs no Google setup at all.
        </div>
      </div>
    </div>
  );
}
