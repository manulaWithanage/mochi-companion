import { useEffect, useState, type JSX } from 'react';
import {
  elapsedMs,
  formatDuration,
  type MochiSettings,
  type Project,
  type TimerSnapshot,
  type WorkSession,
} from '@mochi/core';
import { C, humanDuration } from './ui.js';
import { TodayTab } from './tabs/TodayTab.js';
import { TimeTab } from './tabs/TimeTab.js';
import { RoutinesTab } from './tabs/RoutinesTab.js';
import { MochiTab } from './tabs/MochiTab.js';
import { AiSection } from './AiSection.js';
import { GmailTab } from './tabs/GmailTab.js';
import { CalendarTab } from './tabs/CalendarTab.js';
import { ActivityTab } from './tabs/ActivityTab.js';
import { TasksTab } from './tabs/TasksTab.js';

type TabId =
  | 'today'
  | 'calendar'
  | 'tasks'
  | 'activity'
  | 'time'
  | 'routines'
  | 'gmail'
  | 'settings';

const PRIMARY_TABS: readonly { id: TabId; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'time', label: 'Time' },
  { id: 'activity', label: 'Activity' },
  { id: 'routines', label: 'Routines' },
  { id: 'gmail', label: 'Gmail' },
];

const SETTINGS_TABS: readonly { id: TabId; label: string }[] = [
  { id: 'settings', label: 'Settings' },
];

function renderTabIcon(id: TabId, active: boolean): JSX.Element {
  const strokeColor = active ? C.accent : 'currentColor';
  const strokeWidth = active ? 2.2 : 1.9;
  const opacity = active ? 1 : 0.7;

  switch (id) {
    case 'today':
      return (
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ opacity }}
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      );
    case 'tasks':
      return (
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ opacity }}
        >
          <polyline points="3 7 5 9 9 5" />
          <polyline points="3 16 5 18 9 14" />
          <line x1="13" y1="7" x2="21" y2="7" />
          <line x1="13" y1="17" x2="21" y2="17" />
        </svg>
      );
    case 'calendar':
      return (
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ opacity }}
        >
          <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
          <line x1="16" x2="16" y1="2" y2="6" />
          <line x1="8" x2="8" y1="2" y2="6" />
          <line x1="3" x2="21" y1="10" y2="10" />
          <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" />
        </svg>
      );
    case 'time':
      return (
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ opacity }}
        >
          <line x1="10" x2="14" y1="2" y2="2" />
          <line x1="12" x2="12" y1="14" y2="11" />
          <circle cx="12" cy="14" r="8" />
        </svg>
      );
    case 'activity':
      return (
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ opacity }}
        >
          <line x1="4" x2="4" y1="20" y2="13" />
          <line x1="10" x2="10" y1="20" y2="6" />
          <line x1="16" x2="16" y1="20" y2="10" />
          <line x1="21" x2="21" y1="20" y2="16" />
        </svg>
      );
    case 'routines':
      return (
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ opacity }}
        >
          <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <path d="M3 3v5h5" />
          <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
          <path d="M16 16h5v5" />
        </svg>
      );
    case 'gmail':
      return (
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ opacity }}
        >
          <rect width="20" height="16" x="2" y="4" rx="2" />
          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
        </svg>
      );
    case 'settings':
      return (
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ opacity }}
        >
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
  }
}

function SettingsView(): JSX.Element {
  const [subTab, setSubTab] = useState<'companion' | 'ai'>('companion');

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 24,
          borderBottom: `1px solid ${C.border}`,
          paddingBottom: 16,
        }}
      >
        <div>
          <h2 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, color: C.text }}>
            Settings
          </h2>
          <div style={{ fontSize: 13, color: C.dim }}>
            Manage your companion appearance, schedule, and AI models.
          </div>
        </div>

        {/* Tactile Segmented Switch Buttons */}
        <div
          style={{
            display: 'inline-flex',
            background: 'rgba(10, 8, 16, 0.75)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: 13,
            padding: 4,
            gap: 4,
            boxShadow: 'inset 0 2px 6px rgba(0, 0, 0, 0.5)',
          }}
        >
          <button
            onClick={() => setSubTab('companion')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 18px',
              borderRadius: 10,
              border:
                subTab === 'companion'
                  ? '1px solid rgba(242, 166, 179, 0.45)'
                  : '1px solid transparent',
              background:
                subTab === 'companion'
                  ? 'linear-gradient(180deg, #2e263c 0%, #221a2e 100%)'
                  : 'transparent',
              color: subTab === 'companion' ? '#ffffff' : C.dim,
              fontSize: 13,
              fontWeight: subTab === 'companion' ? 700 : 550,
              cursor: 'pointer',
              transition: 'all 150ms cubic-bezier(0.16, 1, 0.3, 1)',
              boxShadow:
                subTab === 'companion'
                  ? '0 3px 12px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.14)'
                  : 'none',
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: subTab === 'companion' ? C.accent : 'transparent',
                boxShadow: subTab === 'companion' ? `0 0 8px ${C.accent}` : 'none',
                transition: 'all 150ms ease',
              }}
            />
            <span>Companion & Skin</span>
          </button>
          <button
            onClick={() => setSubTab('ai')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 18px',
              borderRadius: 10,
              border:
                subTab === 'ai' ? '1px solid rgba(242, 166, 179, 0.45)' : '1px solid transparent',
              background:
                subTab === 'ai'
                  ? 'linear-gradient(180deg, #2e263c 0%, #221a2e 100%)'
                  : 'transparent',
              color: subTab === 'ai' ? '#ffffff' : C.dim,
              fontSize: 13,
              fontWeight: subTab === 'ai' ? 700 : 550,
              cursor: 'pointer',
              transition: 'all 150ms cubic-bezier(0.16, 1, 0.3, 1)',
              boxShadow:
                subTab === 'ai'
                  ? '0 3px 12px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.14)'
                  : 'none',
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: subTab === 'ai' ? C.accent : 'transparent',
                boxShadow: subTab === 'ai' ? `0 0 8px ${C.accent}` : 'none',
                transition: 'all 150ms ease',
              }}
            />
            <span>AI Providers</span>
          </button>
        </div>
      </div>

      {subTab === 'companion' ? (
        <MochiTab />
      ) : (
        <div>
          <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 650 }}>AI Providers & Keys</h3>
          <p style={{ margin: '0 0 18px', fontSize: 13, color: C.dim }}>
            Bring your own key, or run a local model. Mochi never sees your bill.
          </p>
          <AiSection />
        </div>
      )}
    </div>
  );
}

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
          width: 240,
          flexShrink: 0,
          borderRight: `1px solid ${C.border}`,
          padding: '24px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 5,
          background: 'linear-gradient(180deg, #1f1a2a 0%, #130f1c 100%)',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{ padding: '0 4px 16px', borderBottom: `1px solid ${C.border}`, marginBottom: 12 }}
        >
          {/* Web App Brand Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <svg width="30" height="30" viewBox="0 0 100 100" fill="none" style={{ flexShrink: 0 }}>
              <rect
                x="8"
                y="8"
                width="84"
                height="84"
                rx="32"
                fill="#F8FAFD"
                stroke="#3D4963"
                strokeWidth="7"
              />
              <path
                d="M 28 42 Q 36 32 44 42"
                stroke="#3D4963"
                strokeWidth="6"
                strokeLinecap="round"
                fill="none"
              />
              <path
                d="M 56 42 Q 64 32 72 42"
                stroke="#3D4963"
                strokeWidth="6"
                strokeLinecap="round"
                fill="none"
              />
              <path
                d="M 44 56 Q 50 64 56 56"
                stroke="#3D4963"
                strokeWidth="5"
                strokeLinecap="round"
                fill="none"
              />
              <ellipse cx="22" cy="52" rx="7" ry="5" fill="#FF9F73" opacity="0.9" />
              <ellipse cx="78" cy="52" rx="7" ry="5" fill="#FF9F73" opacity="0.9" />
            </svg>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    fontSize: 17,
                    fontWeight: 800,
                    color: C.accent,
                    letterSpacing: '-0.02em',
                    lineHeight: 1,
                  }}
                >
                  {settings?.assistantName ?? 'Mochi'}
                </span>
              </div>
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 500,
                  color: C.dim,
                  marginTop: 3,
                  letterSpacing: '0.01em',
                }}
              >
                Desktop Companion
              </span>
            </div>
          </div>
          <div
            style={{
              fontSize: 11.5,
              color: running ? C.accent : C.faint,
              marginTop: 10,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            {running ? (
              <div
                style={{
                  background:
                    'linear-gradient(135deg, rgba(242, 166, 179, 0.16), rgba(35, 24, 42, 0.8))',
                  border: `1px solid rgba(242, 166, 179, 0.35)`,
                  boxShadow: '0 4px 14px rgba(0, 0, 0, 0.3)',
                  borderRadius: 11,
                  padding: '10px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 5,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 9.5,
                    fontWeight: 750,
                    color: C.accent,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                  }}
                >
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      background: C.accent,
                      boxShadow: `0 0 8px ${C.accent}`,
                      display: 'inline-block',
                    }}
                  />
                  <span>Tracking Active</span>
                </div>
                <div
                  style={{
                    fontSize: 12.5,
                    fontWeight: 700,
                    color: C.text,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {activeProjectName}
                </div>
                {timer !== null && (
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 650,
                      color: C.accent,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
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
              <div style={{ fontSize: 11.5, color: C.dim }}>
                {humanDuration(todayMs)} focus today
              </div>
            )}
          </div>
        </div>

        {/* Primary Feature Tabs */}
        {PRIMARY_TABS.map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 11,
                textAlign: 'left',
                padding: '9px 12px',
                borderRadius: 10,
                border: 'none',
                borderLeft: active ? `3px solid ${C.accent}` : '3px solid transparent',
                cursor: 'pointer',
                fontSize: 13.5,
                background: active
                  ? 'linear-gradient(90deg, rgba(242, 166, 179, 0.16) 0%, rgba(242, 166, 179, 0.04) 100%)'
                  : 'transparent',
                color: active ? C.accent : C.dim,
                fontWeight: active ? 650 : 500,
                boxShadow: active ? '0 2px 10px rgba(0, 0, 0, 0.2)' : 'none',
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
              <div
                style={{
                  width: 22,
                  height: 22,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {renderTabIcon(t.id, active)}
              </div>
              <span>{t.label}</span>
            </button>
          );
        })}

        {/* Settings Divider */}
        <div
          style={{
            margin: '8px 4px 4px',
            borderTop: `1px solid ${C.border}`,
            paddingTop: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: C.faint,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            Settings
          </span>
        </div>

        {/* Settings Tabs (Mochi & AI) */}
        {SETTINGS_TABS.map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 11,
                textAlign: 'left',
                padding: '9px 12px',
                borderRadius: 10,
                border: 'none',
                borderLeft: active ? `3px solid ${C.accent}` : '3px solid transparent',
                cursor: 'pointer',
                fontSize: 13.5,
                background: active
                  ? 'linear-gradient(90deg, rgba(242, 166, 179, 0.16) 0%, rgba(242, 166, 179, 0.04) 100%)'
                  : 'transparent',
                color: active ? C.accent : C.dim,
                fontWeight: active ? 650 : 500,
                boxShadow: active ? '0 2px 10px rgba(0, 0, 0, 0.2)' : 'none',
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
              <div
                style={{
                  width: 22,
                  height: 22,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {renderTabIcon(t.id, active)}
              </div>
              <span>{t.label}</span>
            </button>
          );
        })}

        <button
          onClick={() => window.mochi.window.closeSetup()}
          style={{
            marginTop: 'auto',
            padding: '9.5px 12px',
            borderRadius: 10,
            border: `1px solid ${C.border}`,
            background: 'rgba(255, 255, 255, 0.03)',
            color: C.dim,
            fontSize: 12.5,
            fontWeight: 500,
            cursor: 'pointer',
            textAlign: 'center',
            transition: 'all 140ms ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
            e.currentTarget.style.color = C.text;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
            e.currentTarget.style.color = C.dim;
          }}
        >
          Close
        </button>
      </nav>

      {/* ---- content ---- */}
      <main style={{ flex: 1, overflowY: 'auto', padding: '28px 36px', boxSizing: 'border-box' }}>
        <div style={{ maxWidth: 1140, margin: '0 auto' }}>
          {tab === 'today' && <TodayTab />}
          {tab === 'time' && <TimeTab />}
          {tab === 'tasks' && <TasksTab />}
          {tab === 'routines' && <RoutinesTab />}
          {tab === 'calendar' && <CalendarTab />}
          {tab === 'activity' && <ActivityTab />}
          {tab === 'gmail' && <GmailTab />}
          {tab === 'settings' && <SettingsView />}
        </div>
      </main>
    </div>
  );
}
