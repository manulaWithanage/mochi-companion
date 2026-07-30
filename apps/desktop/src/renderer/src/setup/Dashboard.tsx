import { useEffect, useState, type JSX } from 'react';
import { elapsedMs, type MochiSettings, type TimerSnapshot, type WorkSession } from '@mochi/core';
import { C, humanDuration } from './ui.js';
import { TodayTab } from './tabs/TodayTab.js';
import { TimeTab } from './tabs/TimeTab.js';
import { RoutinesTab } from './tabs/RoutinesTab.js';
import { MochiTab } from './tabs/MochiTab.js';
import { ConnectionsTab } from './tabs/ConnectionsTab.js';
import { AiSection } from './AiSection.js';
import { GmailTab } from './tabs/GmailTab.js';

/**
 * The dashboard shell.
 *
 * Replaces a single scrolling column of form fields. Each tab fits the window
 * without scrolling, which is what stops this getting worse every time a
 * feature lands — the previous layout had already outgrown its height and
 * Connections had not even been built yet.
 */

type TabId = 'today' | 'time' | 'routines' | 'mochi' | 'ai' | 'connections' | 'gmail';

const TABS: readonly { id: TabId; label: string; icon: string }[] = [
  { id: 'today', label: 'Today', icon: '◔' },
  { id: 'time', label: 'Time', icon: '▤' },
  { id: 'routines', label: 'Routines', icon: '◑' },
  { id: 'mochi', label: 'Mochi', icon: '✿' },
  { id: 'ai', label: 'AI', icon: '✦' },
  { id: 'connections', label: 'Connections', icon: '⚯' },
  { id: 'gmail', label: 'Gmail', icon: '✉' },
];

export function Dashboard(): JSX.Element {
  const [tab, setTab] = useState<TabId>('today');
  const [settings, setSettings] = useState<MochiSettings | null>(null);
  const [timer, setTimer] = useState<TimerSnapshot | null>(null);
  const [todayMs, setTodayMs] = useState(0);

  useEffect(() => {
    void window.mochi.settings.get().then(setSettings);
    void window.mochi.timer.current().then(setTimer);

    const recalc = (sessions: readonly WorkSession[]): void => {
      const now = Date.now();
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      setTodayMs(
        sessions
          .filter((s) => s.startedAt >= start.getTime())
          .reduce((sum, s) => sum + elapsedMs(s, now), 0),
      );
    };
    void window.mochi.timer.listSessions().then(recalc);

    const offSettings = window.mochi.settings.onChange(setSettings);
    const offTimer = window.mochi.timer.onChange((snapshot) => {
      setTimer(snapshot);
      void window.mochi.timer.listSessions().then(recalc);
    });
    return () => {
      offSettings();
      offTimer();
    };
  }, []);

  const running = timer?.running === true;

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: C.bg }}>
      {/* ---- sidebar ---- */}
      <nav
        style={{
          width: 168,
          flexShrink: 0,
          borderRight: `1px solid ${C.border}`,
          padding: '18px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          background: '#191521',
        }}
      >
        <div style={{ padding: '0 10px 14px', borderBottom: `1px solid ${C.border}`, marginBottom: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 650 }}>{settings?.assistantName ?? 'Mochi'}</div>
          <div
            style={{
              fontSize: 11.5,
              color: running ? C.accent : C.faint,
              marginTop: 4,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            {running ? (
              <div
                style={{
                  background: 'rgba(242, 166, 179, 0.15)',
                  border: `1px solid ${C.accent}`,
                  borderRadius: 8,
                  padding: '6px 8px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: C.text }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.accent, display: 'inline-block' }} />
                  <span>Tracking Active</span>
                </div>
                <button
                  onClick={() => void window.mochi.timer.stop().then(setTimer)}
                  style={{
                    background: C.warn,
                    color: '#fff',
                    border: 'none',
                    borderRadius: 5,
                    padding: '3px 6px',
                    fontSize: 10.5,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 3,
                  }}
                >
                  ⏹ Stop Session
                </button>
              </div>
            ) : (
              <div>{humanDuration(todayMs)} today</div>
            )}
          </div>
        </div>

        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                textAlign: 'left',
                padding: '8px 10px',
                borderRadius: 9,
                border: 'none',
                cursor: 'pointer',
                fontSize: 13.5,
                background: active ? 'rgba(242, 166, 179, 0.14)' : 'transparent',
                color: active ? C.accent : C.dim,
                fontWeight: active ? 600 : 500,
              }}
            >
              <span style={{ fontSize: 13, width: 14, textAlign: 'center' }}>{t.icon}</span>
              {t.label}
            </button>
          );
        })}

        <button
          onClick={() => window.mochi.window.closeSetup()}
          style={{
            marginTop: 'auto',
            padding: '8px 10px',
            borderRadius: 9,
            border: `1px solid ${C.border}`,
            background: 'transparent',
            color: C.dim,
            fontSize: 12.5,
            cursor: 'pointer',
          }}
        >
          Close
        </button>
      </nav>

      {/* ---- content ---- */}
      <main style={{ flex: 1, overflowY: 'auto', padding: '24px 26px' }}>
        {tab === 'today' && <TodayTab />}
        {tab === 'time' && <TimeTab />}
        {tab === 'routines' && <RoutinesTab />}
        {tab === 'mochi' && <MochiTab />}
        {tab === 'connections' && <ConnectionsTab />}
        {tab === 'gmail' && <GmailTab />}
        {tab === 'ai' && (
          <div>
            <h2 style={{ margin: '0 0 2px', fontSize: 19, fontWeight: 650 }}>AI</h2>
            <p style={{ margin: '0 0 18px', fontSize: 13, color: C.dim }}>
              Bring your own key, or run a local model. Mochi never sees your bill.
            </p>
            <AiSection />
          </div>
        )}
      </main>
    </div>
  );
}
