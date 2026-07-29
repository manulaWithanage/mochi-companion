import { useEffect, useMemo, useState, type JSX } from 'react';
import { elapsedMs, type Project, type TimerSnapshot, type WorkSession } from '@mochi/core';
import { C, card, dayKey, h2, humanDuration, sub, WEEKDAYS } from '../ui.js';

/**
 * The landing tab: what you did today, and what you are doing right now.
 *
 * Deliberately the first thing shown. Tracked time is the payoff of using
 * Mochi, and it was previously 13px of grey subtitle text.
 */

const stat = (value: string, caption: string, accent = false): JSX.Element => (
  <div style={{ ...card, flex: 1, padding: '14px 16px' }}>
    <div style={{ fontSize: 26, fontWeight: 650, color: accent ? C.accent : C.text }}>{value}</div>
    <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>{caption}</div>
  </div>
);

export function TodayTab(): JSX.Element {
  const [sessions, setSessions] = useState<readonly WorkSession[]>([]);
  const [projects, setProjects] = useState<readonly Project[]>([]);
  const [timer, setTimer] = useState<TimerSnapshot | null>(null);

  useEffect(() => {
    void window.mochi.timer.listSessions().then(setSessions);
    void window.mochi.projects.list().then(setProjects);
    void window.mochi.timer.current().then(setTimer);
    return window.mochi.timer.onChange((snapshot) => {
      setTimer(snapshot);
      // A session just closed — refresh history so the numbers move live.
      if (!snapshot.running) void window.mochi.timer.listSessions().then(setSessions);
    });
  }, []);

  const projectName = useMemo(() => {
    const map = new Map(projects.map((p) => [p.id, p.name]));
    return (id: string): string => map.get(id) ?? 'General';
  }, [projects]);

  const { todayMs, weekMs, streak, last7 } = useMemo(() => {
    const now = Date.now();
    const today = dayKey(now);

    const byDay = new Map<string, number>();
    for (const s of sessions) {
      const key = dayKey(s.startedAt);
      byDay.set(key, (byDay.get(key) ?? 0) + elapsedMs(s, now));
    }

    // Last seven days, oldest first, so the bar chart reads left to right.
    const days: { key: string; label: string; ms: number }[] = [];
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date(now - i * 86_400_000);
      const key = dayKey(d.getTime());
      days.push({ key, label: WEEKDAYS[d.getDay()]!, ms: byDay.get(key) ?? 0 });
    }

    // Consecutive days with any tracked time, counting back from today.
    let run = 0;
    for (let i = 0; ; i += 1) {
      const key = dayKey(now - i * 86_400_000);
      if ((byDay.get(key) ?? 0) <= 0) break;
      run += 1;
    }

    return {
      todayMs: byDay.get(today) ?? 0,
      weekMs: days.reduce((sum, d) => sum + d.ms, 0),
      streak: run,
      last7: days,
    };
  }, [sessions]);

  const peak = Math.max(1, ...last7.map((d) => d.ms));
  const recent = sessions.slice(0, 6);

  return (
    <div>
      <h2 style={h2}>Today</h2>
      <p style={sub}>
        {timer?.running === true
          ? `Tracking ${projectName(timer.session?.projectId ?? '')} right now.`
          : 'Click Mochi on your desktop to start tracking.'}
      </p>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        {stat(humanDuration(todayMs), 'today', true)}
        {stat(humanDuration(weekMs), 'last 7 days')}
        {stat(streak === 0 ? '—' : `${streak}`, streak === 1 ? 'day streak' : 'day streak')}
      </div>

      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: C.dim, marginBottom: 12 }}>Last 7 days</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 84 }}>
          {last7.map((d, i) => (
            <div key={d.key} style={{ flex: 1, textAlign: 'center' }}>
              <div
                title={humanDuration(d.ms)}
                style={{
                  height: Math.max(3, (d.ms / peak) * 62),
                  borderRadius: 5,
                  // Today reads as the live one; the rest recede.
                  background: i === last7.length - 1 ? C.accent : C.borderStrong,
                  transition: 'height 240ms ease',
                }}
              />
              <div style={{ fontSize: 10, color: C.faint, marginTop: 6 }}>{d.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={card}>
        <div style={{ fontSize: 12, color: C.dim, marginBottom: 10 }}>Recent sessions</div>
        {recent.length === 0 ? (
          <div style={{ fontSize: 13, color: C.faint, padding: '6px 0' }}>
            Nothing tracked yet — one click on the mascot starts a session.
          </div>
        ) : (
          recent.map((s) => (
            <div
              key={s.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '7px 0',
                borderTop: `1px solid ${C.border}`,
                fontSize: 13,
              }}
            >
              <span>{projectName(s.projectId)}</span>
              <span style={{ color: C.dim, fontVariantNumeric: 'tabular-nums' }}>
                {new Date(s.startedAt).toLocaleString([], {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                {'  ·  '}
                {humanDuration(elapsedMs(s, Date.now()))}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
