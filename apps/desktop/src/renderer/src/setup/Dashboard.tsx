import { useEffect, useState, type JSX } from 'react';
import { elapsedMs, formatDuration, type MochiSettings, type Project, type TimerSnapshot, type WorkSession } from '@mochi/core';
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
  const [projects, setProjects] = useState<readonly Project[]>([]);
  const [todayMs, setTodayMs] = useState(0);

  useEffect(() => {
    void window.mochi.settings.get().then(setSettings);
    void window.mochi.timer.current().then(setTimer);
    void window.mochi.projects.list().then(setProjects);

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
      void window.mochi.projects.list().then(setProjects);
    });
    return () => {
      offSettings();
      offTimer();
    };
  }, []);

  // Ticking live timer for sidebar card
  useEffect(() => {
    if (timer === null || !timer.running) return;
    const id = setInterval(() => {
      void window.mochi.timer.current().then(setTimer);
    }, 1000);
    return () => clearInterval(id);
  }, [timer]);

  const activeProjectId = timer?.projectId || timer?.session?.projectId || null;
  const activeProject = projects.find((p) => p.id === activeProjectId);
  const activeProjectName = activeProject ? activeProject.name : 'Focus Session';

  const running = timer?.running === true;

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: C.bg }}>
      {/* ---- sidebar ---- */}
      <nav
        style={{
          width: 195,
          flexShrink: 0,
          borderRight: `1px solid ${C.border}`,
          padding: '20px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          background: 'linear-gradient(180deg, #1e1929 0%, #14101b 100%)',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ padding: '0 6px 16px', borderBottom: `1px solid ${C.border}`, marginBottom: 10 }}>
          <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em', color: C.text }}>
            {settings?.assistantName ?? 'Mochi'}
          </div>
          <div
            style={{
              fontSize: 11.5,
              color: running ? C.accent : C.faint,
              marginTop: 6,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            {running ? (
              <div
                style={{
                  background: 'linear-gradient(135deg, rgba(242, 166, 179, 0.16), rgba(35, 24, 42, 0.8))',
                  border: `1px solid rgba(242, 166, 179, 0.35)`,
                  boxShadow: '0 4px 14px rgba(0, 0, 0, 0.3)',
                  borderRadius: 11,
                  padding: '10px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 5,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9.5, fontWeight: 750, color: C.accent, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.accent, boxShadow: `0 0 8px ${C.accent}`, display: 'inline-block' }} />
                  <span>Tracking Active</span>
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {activeProjectName}
                </div>
                {timer !== null && (
                  <div style={{ fontSize: 12, fontWeight: 650, color: C.accent, fontVariantNumeric: 'tabular-nums' }}>
                    {formatDuration(timer.elapsedMs)}
                  </div>
                )}
                <button
                  onClick={() => void window.mochi.timer.stop().then(setTimer)}
                  style={{
                    background: 'linear-gradient(135deg, #ff5e7e, #e63956)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 7,
                    padding: '5px 8px',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                    marginTop: 3,
                    boxShadow: '0 2px 8px rgba(230, 57, 86, 0.35)',
                    transition: 'transform 120ms ease, filter 120ms ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.filter = 'brightness(1.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.filter = 'none';
                  }}
                >
                  <span>⏹</span>
                  <span>Stop Session</span>
                </button>
              </div>
            ) : (
              <div style={{ fontSize: 11.5, color: C.dim }}>{humanDuration(todayMs)} focus today</div>
            )}
          </div>
        </div>

        {/* Tab Items */}
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                textAlign: 'left',
                padding: '9px 12px',
                borderRadius: 9,
                border: 'none',
                borderLeft: active ? `3px solid ${C.accent}` : '3px solid transparent',
                cursor: 'pointer',
                fontSize: 13.5,
                background: active ? 'rgba(242, 166, 179, 0.12)' : 'transparent',
                color: active ? C.accent : C.dim,
                fontWeight: active ? 650 : 450,
                transition: 'all 140ms ease',
              }}
              onMouseEnter={(e) => {
                if (!active) {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                  e.currentTarget.style.color = C.text;
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = C.dim;
                }
              }}
            >
              <span style={{ fontSize: 14, width: 16, textAlign: 'center', opacity: active ? 1 : 0.7 }}>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          );
        })}

        <button
          onClick={() => window.mochi.window.closeSetup()}
          style={{
            marginTop: 'auto',
            padding: '9px 12px',
            borderRadius: 9,
            border: `1px solid ${C.border}`,
            background: 'rgba(255, 255, 255, 0.02)',
            color: C.dim,
            fontSize: 12.5,
            fontWeight: 500,
            cursor: 'pointer',
            textAlign: 'center',
            transition: 'all 140ms ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
            e.currentTarget.style.color = C.text;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)';
            e.currentTarget.style.color = C.dim;
          }}
        >
          Close
        </button>
      </nav>

      {/* ---- content ---- */}
      <main style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', boxSizing: 'border-box' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
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
        </div>
      </main>
    </div>
  );
}
