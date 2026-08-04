import { useCallback, useEffect, useMemo, useState, type JSX } from 'react';
import {
  elapsedMs,
  progressForToday,
  type AgendaItem,
  type Project,
  type TimerSnapshot,
  type WorkSession,
} from '@mochi/core';
import { button, C, card, dayKey, humanDuration, input, WEEKDAYS } from '../ui.js';
import type { AgendaSources } from '../useAgenda.js';

/**
 * The day as one list you can finish.
 *
 * This used to be a dashboard: a welcome banner, four tutorial cards that never
 * went away, three stat tiles, a task list, and two more cards for mail and
 * calendar. Every part was reasonable and the sum was not, because answering
 * "what do I need to do today" still meant reading four separate lists and
 * holding the result in your head.
 *
 * Now there is one merged list of work, and a quiet timeline of things that
 * merely happen. The split is load-bearing and lives in `buildAgenda`: only
 * finishable things are counted, so the number on screen can actually reach
 * zero. That is the one thing this view offers that an inbox never can.
 *
 * **Still no invented data.** An unconnected calendar says so rather than
 * rendering an empty timeline, because "nothing on today" and "no calendar" look
 * identical when both are blank and only one is worth acting on.
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
    <div style={{ fontSize: 22, fontWeight: 650, color: accent === true ? C.accent : C.text }}>
      {value}
    </div>
    <div style={{ fontSize: 11.5, color: C.dim, marginTop: 2 }}>{caption}</div>
  </div>
);

/** A source that is not connected, said plainly rather than left looking empty. */
const NotConnected = ({ what, why }: { what: string; why: string }): JSX.Element => (
  <div
    style={{
      fontSize: 12,
      color: C.faint,
      padding: '9px 12px',
      border: `1px dashed ${C.border}`,
      borderRadius: 9,
      lineHeight: 1.5,
    }}
  >
    <strong style={{ color: C.dim, fontWeight: 600 }}>{what} not connected.</strong> {why}
  </div>
);

const KIND_LABEL: Record<AgendaItem['kind'], string> = {
  email: 'email',
  task: 'task',
  event: 'calendar',
};

/**
 * One row of work.
 *
 * A single primary action, and nothing else competing with it. The previous Gmail
 * design put seven controls on every row — read, draft, three reply styles,
 * snooze, dismiss — and with six rows that is forty-two things at identical
 * weight, so nothing tells you where to start. One tick box and at most one
 * button is the whole vocabulary here.
 */
function WorkRow({
  item,
  onDone,
  action,
}: {
  item: AgendaItem;
  onDone: () => void;
  action?: { label: string; run: () => void; title: string };
}): JSX.Element {
  const [hover, setHover] = useState(false);

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 11,
        padding: '10px 12px',
        borderRadius: 9,
        background: hover ? 'rgba(255,255,255,0.035)' : 'transparent',
        transition: 'background 140ms ease',
      }}
    >
      <input
        type="checkbox"
        checked={false}
        onChange={onDone}
        title={item.kind === 'email' ? 'Mark handled — stops the reminder' : 'Mark done'}
        style={{ accentColor: C.accent, width: 15, height: 15, cursor: 'pointer', flexShrink: 0 }}
      />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            color: C.text,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {item.title}
        </div>
        <div style={{ fontSize: 11, color: item.late ? C.warn : C.faint, marginTop: 2 }}>
          {KIND_LABEL[item.kind]} · {item.detail}
        </div>
      </div>

      {action !== undefined && (
        <button
          type="button"
          onClick={action.run}
          title={action.title}
          style={{ ...button('ghost'), padding: '4px 11px', fontSize: 11.5, flexShrink: 0 }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

/** Something that happens whether or not you do anything. No tick box. */
function ScheduleRow({ item }: { item: AgendaItem }): JSX.Element {
  const now = item.detail === 'on now';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px' }}>
      <span
        style={{
          fontSize: 11.5,
          color: now ? C.accent : C.faint,
          fontVariantNumeric: 'tabular-nums',
          minWidth: 52,
          fontWeight: now ? 650 : 400,
        }}
      >
        {item.detail}
      </span>
      <span
        style={{
          fontSize: 13,
          color: now ? C.text : C.dim,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {item.title}
      </span>
    </div>
  );
}

export function TodayTab({
  agenda,
  tasks,
  gmailConnected,
  calendarConnected,
  reloadEmails,
  onSelectTab,
}: AgendaSources & { onSelectTab?: (tab: string) => void }): JSX.Element {
  const [sessions, setSessions] = useState<readonly WorkSession[]>([]);
  const [projects, setProjects] = useState<readonly Project[]>([]);
  const [timer, setTimer] = useState<TimerSnapshot | null>(null);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    void window.mochi.timer.listSessions().then(setSessions);
    void window.mochi.projects.list().then(setProjects);
    void window.mochi.timer.current().then(setTimer);

    const offTimer = window.mochi.timer.onChange((snapshot) => {
      setTimer(snapshot);
      if (!snapshot.running) void window.mochi.timer.listSessions().then(setSessions);
    });
    return offTimer;
  }, []);

  const addTask = useCallback(async () => {
    if (draft.trim().length === 0) return;
    await window.mochi.tasks.create(draft);
    setDraft('');
    // No refetch: the tasks.onChange subscription in useSources pushes the new
    // list, and asking again here would race it.
  }, [draft]);

  // Only for the date heading and the progress figures; the agenda itself is
  // already assembled against a ticking clock in useAgenda.
  const now = new Date();

  const projectName = useMemo(() => {
    const map = new Map(projects.map((p) => [p.id, p.name]));
    return (id: string): string => map.get(id) ?? 'General';
  }, [projects]);

  const { todayMs, last7 } = useMemo(() => {
    const at = Date.now();
    const byDay = new Map<string, number>();
    for (const s of sessions) {
      const key = dayKey(s.startedAt);
      byDay.set(key, (byDay.get(key) ?? 0) + elapsedMs(s, at));
    }
    const days: { key: string; label: string; ms: number }[] = [];
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date(at - i * 86_400_000);
      days.push({ key: dayKey(d.getTime()), label: WEEKDAYS[d.getDay()]!, ms: 0 });
    }
    for (const d of days) d.ms = byDay.get(d.key) ?? 0;
    return { todayMs: byDay.get(dayKey(at)) ?? 0, last7: days };
  }, [sessions]);

  const progress = progressForToday(tasks, now);
  const peak = Math.max(1, ...last7.map((d) => d.ms));
  const weekTotal = last7.reduce((sum, d) => sum + d.ms, 0);

  const count = agenda.needsYou.length;

  /** Tick a row off. What that means depends on what the row is. */
  const complete = useCallback(
    (item: AgendaItem) => {
      const id = item.id.slice(item.id.indexOf(':') + 1);
      if (item.kind === 'task') {
        void window.mochi.tasks.toggle(id);
        return;
      }
      // An email is *handled*, not replied to. Dismissing stops the reminder and
      // claims nothing about having answered — saying "replied" here would be
      // inventing an outcome.
      void window.mochi.gmail.dismissReminder(id).then(() => reloadEmails());
    },
    [reloadEmails],
  );

  const rowAction = (
    item: AgendaItem,
  ): { label: string; run: () => void; title: string } | undefined => {
    if (item.kind === 'email') {
      return {
        label: 'Reply',
        run: () => onSelectTab?.('gmail'),
        title: 'Open the inbox to write a reply',
      };
    }
    if (item.kind === 'task' && item.late) {
      return {
        label: 'Move to today',
        run: () => void window.mochi.tasks.rollForward(item.id.slice('task:'.length)),
        title: 'Carry this over to today',
      };
    }
    return undefined;
  };

  return (
    <div>
      {/* ---- what needs you ---- */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 2 }}>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: C.text }}>Today</h2>
          <span style={{ fontSize: 12, color: C.faint }}>
            {now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
          </span>
        </div>
        <p style={{ margin: '0 0 14px', fontSize: 13, color: count > 0 ? C.dim : C.faint }}>
          {count === 0
            ? 'Nothing needs you right now.'
            : `${count} thing${count === 1 ? '' : 's'} need${count === 1 ? 's' : ''} you.`}
          {timer?.running === true && ` Tracking ${projectName(timer.session?.projectId ?? '')}.`}
        </p>

        <div style={{ ...card, padding: '6px 4px' }}>
          {count === 0 ? (
            <div style={{ fontSize: 13, color: C.faint, padding: '14px 12px', lineHeight: 1.5 }}>
              No replies waiting and nothing due. Add something below, or enjoy the quiet.
            </div>
          ) : (
            agenda.needsYou.map((item) => {
              // Resolved once and spread, because `exactOptionalPropertyTypes`
              // rejects passing an explicit undefined for an optional prop.
              const action = rowAction(item);
              return (
                <WorkRow
                  key={item.id}
                  item={item}
                  onDone={() => complete(item)}
                  {...(action === undefined ? {} : { action })}
                />
              );
            })
          )}

          <div style={{ display: 'flex', gap: 8, padding: '8px 8px 6px' }}>
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

        {gmailConnected === false && (
          <div style={{ marginTop: 8 }}>
            <NotConnected
              what="Email"
              why="Connect it in Settings and replies Mochi thinks are urgent will appear here."
            />
          </div>
        )}
      </div>

      {/* ---- on your calendar ---- */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 12, color: C.dim, marginBottom: 8 }}>On your calendar</div>
        {calendarConnected === false ? (
          <NotConnected
            what="Calendar"
            why="Connect an ICS feed in Settings to see today's meetings alongside your work."
          />
        ) : (
          <div style={{ ...card, padding: '6px 4px' }}>
            {agenda.schedule.length === 0 ? (
              <div style={{ fontSize: 13, color: C.faint, padding: '12px' }}>Nothing on today.</div>
            ) : (
              agenda.schedule.map((item) => <ScheduleRow key={item.id} item={item} />)
            )}
          </div>
        )}
      </div>

      {/* ---- how the day and week went ---- */}
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
        <Stat value={`${progress.overdue}`} caption="overdue" accent={progress.overdue > 0} />
      </div>

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

      {/* Nothing set up yet: the only time tutorial cards earn their space. */}
      {tasks.length === 0 && sessions.length === 0 && (
        <div style={{ ...card, marginTop: 14 }}>
          <div style={{ fontSize: 12, color: C.dim, marginBottom: 10 }}>Getting started</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {[
              { id: 'tasks', title: 'Add a few tasks', desc: 'So you know where to start.' },
              { id: 'time', title: 'Track a session', desc: 'See where the day actually goes.' },
              {
                id: 'routines',
                title: 'Set a routine',
                desc: 'Water and stretch reminders while you work.',
              },
            ].map((c) => (
              <button
                key={c.id}
                onClick={() => onSelectTab?.(c.id)}
                style={{
                  textAlign: 'left',
                  background: 'rgba(255,255,255,0.035)',
                  border: `1px solid ${C.border}`,
                  borderRadius: 9,
                  padding: '11px 12px',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: 12.5, fontWeight: 650, color: C.text, marginBottom: 3 }}>
                  {c.title}
                </div>
                <div style={{ fontSize: 11, color: C.dim, lineHeight: 1.4 }}>{c.desc}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
