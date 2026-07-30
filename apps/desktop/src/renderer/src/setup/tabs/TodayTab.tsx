import { useCallback, useEffect, useMemo, useState, type JSX } from 'react';
import {
  clockLabel,
  describeLead,
  dueToday,
  elapsedMs,
  inProgress,
  needsReplyReminder,
  upcoming,
  progressForToday,
  sortForDisplay,
  taskDay,
  type CachedInboxItem,
  type CalendarEvent,
  type CalendarStatus,
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

/**
 * What is coming, once a calendar is connected.
 *
 * Falls back to the locked card rather than an empty one: "nothing today" and
 * "no calendar connected" look identical if both render as a blank list, and
 * only one of them is worth acting on.
 */
function ComingUp(): JSX.Element {
  const [status, setStatus] = useState<CalendarStatus | null>(null);
  const [events, setEvents] = useState<readonly CalendarEvent[]>([]);
  const [now, setNow] = useState(() => Date.now());

  const reload = useCallback(() => {
    void window.mochi.calendar.events().then(setEvents);
  }, []);

  useEffect(() => {
    void window.mochi.calendar.status().then(setStatus);
    reload();
    return window.mochi.calendar.onChange((next) => {
      setStatus(next);
      reload();
    });
  }, [reload]);

  // The countdown has to move on its own, or "in 5 min" is still on screen
  // twenty minutes later.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (status?.connected !== true) {
    return (
      <LockedCard
        title="Coming up"
        needs="CALENDAR"
        examples="Your next meeting, with a reminder five minutes before and a one-click join."
      />
    );
  }

  const running = inProgress(events, now);
  const next = upcoming(events, now, 12 * 60 * 60_000).slice(0, 3);
  const current = running[0];

  return (
    <div style={{ ...card, flex: 1 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
        }}
      >
        <strong style={{ fontSize: 13 }}>Coming up</strong>
        {status.error !== undefined && (
          <span style={{ fontSize: 10.5, color: C.warn, letterSpacing: 0.4 }}>OUT OF DATE</span>
        )}
      </div>

      {current !== undefined && (
        <div
          style={{
            border: `1px solid rgba(242,166,179,0.3)`,
            background: 'rgba(242,166,179,0.07)',
            borderRadius: 9,
            padding: '8px 10px',
            marginBottom: 8,
          }}
        >
          <div style={{ fontSize: 10.5, color: C.accent, letterSpacing: 0.4, marginBottom: 2 }}>
            NOW
          </div>
          <div style={{ fontSize: 13, color: C.text }}>{current.title}</div>
          <div style={{ fontSize: 11.5, color: C.dim, marginTop: 2 }}>
            until {clockLabel(current.endsAt)}
            {current.conferenceUrl !== undefined && ' · joinable'}
          </div>
        </div>
      )}

      {next.length === 0 && current === undefined ? (
        <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.5 }}>
          Nothing else scheduled today. The rest of the day is yours.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {next.map((event) => (
            <div key={event.id} style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span
                style={{
                  fontSize: 11.5,
                  color: C.faint,
                  minWidth: 52,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {clockLabel(event.startsAt)}
              </span>
              <span style={{ fontSize: 12.5, color: C.text, flex: 1, lineHeight: 1.4 }}>
                {event.title}
              </span>
              <span style={{ fontSize: 11, color: C.dim, whiteSpace: 'nowrap' }}>
                {describeLead(event.startsAt - now)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Mail that is actually waiting on you.
 *
 * Filtered by needsReplyReminder, the same predicate the governor uses to
 * decide whether an email is worth interrupting for — so this card and Mochi
 * never disagree about what counts as urgent.
 */
function NeedsReply(): JSX.Element {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [items, setItems] = useState<readonly CachedInboxItem[]>([]);

  const reload = useCallback(() => {
    void window.mochi.gmail
      .listCached({ sort: 'priority', limit: 25 })
      .then((all) => setItems(all.filter(needsReplyReminder).slice(0, 3)))
      .catch(() => setItems([]));
  }, []);

  useEffect(() => {
    void window.mochi.gmail.status().then((s) => {
      setConnected(s.connected);
      if (s.connected) reload();
    });
    return window.mochi.gmail.onInboxChanged(() => reload());
  }, [reload]);

  if (connected !== true) {
    return (
      <LockedCard
        title="Needs a reply"
        needs="EMAIL"
        examples="Threads Mochi thinks are urgent, so the rest of the inbox can wait."
      />
    );
  }

  return (
    <div style={{ ...card, flex: 1 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
        }}
      >
        <strong style={{ fontSize: 13 }}>Needs a reply</strong>
        {items.length > 0 && (
          <span style={{ fontSize: 10.5, color: C.faint, letterSpacing: 0.4 }}>
            {items.length} WAITING
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.5 }}>
          Nothing urgent. The rest of the inbox can wait.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((email) => (
            <div key={email.emailId} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 5,
                  flexShrink: 0,
                  transform: 'translateY(-1px)',
                  background: email.priority?.tier === 'urgent' ? C.warn : C.accent,
                }}
              />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: 12.5,
                    color: C.text,
                    lineHeight: 1.35,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {email.subject}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: C.faint,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {email.fromName || email.fromAddress}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

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
  const weekTotal = last7.reduce((sum, d) => sum + d.ms, 0);

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
        {/*
          An em-dash for "no tasks yet" read as a rendering fault rather than a
          zero state. A plain 0 cannot be mistaken for something broken.
        */}
        <Stat
          value={progress.total === 0 ? '0' : `${progress.done}/${progress.total}`}
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

      {/* ---- what is waiting ---- */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'stretch' }}>
        <ComingUp />
        <NeedsReply />
      </div>

      {/* ---- week ---- */}
      <div style={card}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: 14,
          }}
        >
          <span style={{ fontSize: 12, color: C.dim }}>Last 7 days</span>
          <span style={{ fontSize: 11.5, color: C.faint }}>
            {weekTotal > 0 ? `${humanDuration(weekTotal)} total` : 'nothing tracked yet'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 96 }}>
          {last7.map((d, i) => {
            const isToday = i === last7.length - 1;
            const filled = d.ms > 0 ? Math.max(4, (d.ms / peak) * 56) : 0;
            return (
              <div key={d.key} style={{ flex: 1, textAlign: 'center' }}>
                <div
                  style={{
                    fontSize: 10,
                    color: d.ms > 0 ? C.dim : 'transparent',
                    marginBottom: 4,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {humanDuration(d.ms)}
                </div>

                {/*
                  A track behind every bar. Previously an empty day rendered as
                  a 3px sliver, which read as a rendering fault rather than as
                  "nothing here" — the one thing a chart of mostly-empty days
                  has to get right.
                */}
                <div
                  title={`${d.label}: ${d.ms > 0 ? humanDuration(d.ms) : 'nothing tracked'}`}
                  style={{
                    height: 56,
                    borderRadius: 6,
                    background: 'rgba(255,255,255,0.035)',
                    display: 'flex',
                    alignItems: 'flex-end',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: '100%',
                      height: filled,
                      borderRadius: 6,
                      background: isToday ? C.accent : C.borderStrong,
                      transition: 'height 240ms ease',
                    }}
                  />
                </div>

                <div
                  style={{
                    fontSize: 10,
                    color: isToday ? C.accent : C.faint,
                    marginTop: 6,
                    fontWeight: isToday ? 600 : 400,
                  }}
                >
                  {d.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
