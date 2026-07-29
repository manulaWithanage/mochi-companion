import { useCallback, useEffect, useMemo, useState, type JSX } from 'react';
import {
  dueToday,
  elapsedMs,
  progressForToday,
  sortForDisplay,
  taskDay,
  type Project,
  type Task,
  type TimerSnapshot,
  type WorkSession,
} from '@mochi/core';
import { button, C, card, dayKey, h2, humanDuration, input, sub, WEEKDAYS } from '../ui.js';

/**
 * The daily overview: time tracked, today's checklist, and what is coming.
 *
 * The upcoming and inbox cards are shown in a locked state rather than
 * hidden. Progressive unlock only works if the locked thing states its own
 * requirement — and, importantly, they show **no invented data**. A fake
 * meeting that looks real is worse than an empty card, because nobody can
 * tell which is which once one of them is genuine.
 */

const Stat = ({
  value,
  caption,
  accent,
}: {
  value: string;
  caption: string;
  accent?: boolean;
}): JSX.Element => (
  <div style={{ ...card, flex: 1, padding: '13px 15px' }}>
    <div style={{ fontSize: 24, fontWeight: 650, color: accent === true ? C.accent : C.text }}>
      {value}
    </div>
    <div style={{ fontSize: 11.5, color: C.dim, marginTop: 2 }}>{caption}</div>
  </div>
);

/** A capability that needs a connection, shown honestly rather than faked. */
const LockedCard = ({
  title,
  needs,
  examples,
}: {
  title: string;
  needs: string;
  examples: string;
}): JSX.Element => (
  <div style={{ ...card, flex: 1, borderStyle: 'dashed', background: 'transparent' }}>
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
      }}
    >
      <strong style={{ fontSize: 13 }}>{title}</strong>
      <span style={{ fontSize: 10.5, color: C.faint, letterSpacing: 0.4 }}>NEEDS {needs}</span>
    </div>
    <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.5 }}>{examples}</div>
  </div>
);

export function TodayTab(): JSX.Element {
  const [sessions, setSessions] = useState<readonly WorkSession[]>([]);
  const [projects, setProjects] = useState<readonly Project[]>([]);
  const [tasks, setTasks] = useState<readonly Task[]>([]);
  const [timer, setTimer] = useState<TimerSnapshot | null>(null);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    void window.mochi.timer.listSessions().then(setSessions);
    void window.mochi.projects.list().then(setProjects);
    void window.mochi.tasks.list().then(setTasks);
    void window.mochi.timer.current().then(setTimer);

    const offTasks = window.mochi.tasks.onChange(setTasks);
    const offTimer = window.mochi.timer.onChange((snapshot) => {
      setTimer(snapshot);
      if (!snapshot.running) void window.mochi.timer.listSessions().then(setSessions);
    });
    return () => {
      offTasks();
      offTimer();
    };
  }, []);

  const addTask = useCallback(async () => {
    if (draft.trim().length === 0) return;
    await window.mochi.tasks.create(draft);
    setDraft('');
    setTasks(await window.mochi.tasks.list());
  }, [draft]);

  const projectName = useMemo(() => {
    const map = new Map(projects.map((p) => [p.id, p.name]));
    return (id: string): string => map.get(id) ?? 'General';
  }, [projects]);

  const { todayMs, last7 } = useMemo(() => {
    const now = Date.now();
    const byDay = new Map<string, number>();
    for (const s of sessions) {
      const key = dayKey(s.startedAt);
      byDay.set(key, (byDay.get(key) ?? 0) + elapsedMs(s, now));
    }
    const days: { key: string; label: string; ms: number }[] = [];
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date(now - i * 86_400_000);
      days.push({ key: dayKey(d.getTime()), label: WEEKDAYS[d.getDay()]!, ms: 0 });
    }
    for (const d of days) d.ms = byDay.get(d.key) ?? 0;
    return { todayMs: byDay.get(dayKey(now)) ?? 0, last7: days };
  }, [sessions]);

  const now = new Date();
  const today = taskDay(now);
  const open = sortForDisplay(dueToday(tasks, now), now);
  const progress = progressForToday(tasks, now);
  const peak = Math.max(1, ...last7.map((d) => d.ms));

  return (
    <div>
      <h2 style={h2}>Today</h2>
      <p style={sub}>
        {timer?.running === true
          ? `Tracking ${projectName(timer.session?.projectId ?? '')} right now.`
          : 'Click Mochi on your desktop to start tracking.'}
      </p>

      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <Stat value={humanDuration(todayMs)} caption="tracked today" accent />
        <Stat
          value={progress.total === 0 ? '—' : `${progress.done}/${progress.total}`}
          caption="tasks done"
        />
        <Stat
          value={progress.overdue === 0 ? '0' : `${progress.overdue}`}
          caption="overdue"
          accent={progress.overdue > 0}
        />
      </div>

      {/* ---- today's tasks ---- */}
      <div style={{ ...card, marginBottom: 14 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 10,
          }}
        >
          <span style={{ fontSize: 12, color: C.dim }}>Today&apos;s list</span>
          {progress.total > 0 && (
            <span style={{ fontSize: 11.5, color: C.faint }}>{progress.pct}%</span>
          )}
        </div>

        {progress.total > 0 && (
          <div
            style={{
              height: 4,
              borderRadius: 2,
              background: '#332c3d',
              overflow: 'hidden',
              marginBottom: 12,
            }}
          >
            <div
              style={{
                width: `${progress.pct}%`,
                height: '100%',
                background: C.accent,
                transition: 'width 220ms ease',
              }}
            />
          </div>
        )}

        {open.length === 0 && (
          <div style={{ fontSize: 13, color: C.faint, padding: '2px 0 10px' }}>
            Nothing on the list. Add something below, or enjoy the quiet.
          </div>
        )}

        {open.map((t) => {
          const late = t.dueOn !== null && t.dueOn < today;
          return (
            <div
              key={t.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '7px 0',
                borderTop: `1px solid ${C.border}`,
                fontSize: 13,
              }}
            >
              <input
                type="checkbox"
                checked={false}
                onChange={() => void window.mochi.tasks.toggle(t.id)}
                style={{ accentColor: C.accent, width: 15, height: 15, cursor: 'pointer' }}
              />
              <span style={{ flex: 1 }}>{t.title}</span>
              {late && (
                <button
                  onClick={() => void window.mochi.tasks.rollForward(t.id)}
                  title="Move to today"
                  style={{
                    ...button('ghost'),
                    padding: '2px 8px',
                    fontSize: 11,
                    color: C.warn,
                    borderColor: 'rgba(255,179,193,0.35)',
                  }}
                >
                  overdue
                </button>
              )}
              <button
                onClick={() => void window.mochi.tasks.remove(t.id)}
                title="Delete"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: C.faint,
                  cursor: 'pointer',
                  fontSize: 15,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
          );
        })}

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <input
            style={input}
            placeholder="Add a task for today…"
            value={draft}
            maxLength={140}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void addTask();
            }}
          />
          <button
            style={{ ...button('primary'), whiteSpace: 'nowrap' }}
            disabled={draft.trim().length === 0}
            onClick={() => void addTask()}
          >
            Add
          </button>
        </div>
      </div>

      {/* ---- not yet connected ---- */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <LockedCard
          title="Coming up"
          needs="CALENDAR"
          examples="Your next meeting, with a reminder five minutes before and a one-click join."
        />
        <LockedCard
          title="Needs a reply"
          needs="EMAIL"
          examples="Threads Mochi thinks are urgent, so the rest of the inbox can wait."
        />
      </div>

      {/* ---- week ---- */}
      <div style={card}>
        <div style={{ fontSize: 12, color: C.dim, marginBottom: 12 }}>Last 7 days</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 74 }}>
          {last7.map((d, i) => (
            <div key={d.key} style={{ flex: 1, textAlign: 'center' }}>
              <div
                title={humanDuration(d.ms)}
                style={{
                  height: Math.max(3, (d.ms / peak) * 52),
                  borderRadius: 5,
                  background: i === last7.length - 1 ? C.accent : C.borderStrong,
                  transition: 'height 240ms ease',
                }}
              />
              <div style={{ fontSize: 10, color: C.faint, marginTop: 6 }}>{d.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
