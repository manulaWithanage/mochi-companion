import type { JSX } from 'react';
import { C, card, h2, sub } from '../ui.js';

/**
 * Google, and what it unlocks.
 *
 * Nothing here is wired yet — it lands at M3. It is shown rather than hidden
 * because progressive unlock only works if the locked thing states its own
 * requirement; a feature nobody can see is a feature nobody asks for.
 *
 * Note what is deliberately absent: there is no Mochi account. Connecting
 * Google authorises Google to share data with the app on this machine. It
 * does not create an account with us, because there is no us to have one
 * with — no server, no database, nothing to sign into.
 */

interface Row {
  readonly name: string;
  readonly unlocks: string;
  readonly note: string;
  readonly effort: string;
}

const PLANNED: readonly Row[] = [
  {
    name: 'Google Calendar',
    unlocks: 'Morning briefing · meeting alerts · one-click join',
    note: 'Uses Google’s own Calendar server. Your events are read on this machine and never sent anywhere else.',
    effort: 'about 10 minutes, one-time',
  },
  {
    name: 'Email',
    unlocks: 'Urgent-mail triage',
    note: 'IMAP with an app password works with any provider and needs no Google setup at all. Gmail is also supported.',
    effort: 'about 5 minutes',
  },
];

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
          There is no Mochi login, because there is no Mochi server. Connecting Google authorises{' '}
          <em>Google</em> to share your calendar with this app, on this machine. Your data, your
          keys and your history never leave it.
        </div>
      </div>

      {PLANNED.map((row) => (
        <div key={row.name} style={{ ...card, marginBottom: 12, opacity: 0.72 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 6,
            }}
          >
            <strong style={{ fontSize: 14 }}>{row.name}</strong>
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
          <div style={{ fontSize: 12.5, color: C.text, marginBottom: 6 }}>{row.unlocks}</div>
          <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.55 }}>{row.note}</div>
          <div style={{ fontSize: 11.5, color: C.faint, marginTop: 8 }}>Setup: {row.effort}</div>
        </div>
      ))}
    </div>
  );
}
