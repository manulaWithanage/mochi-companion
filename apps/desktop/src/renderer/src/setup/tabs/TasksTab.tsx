import { useCallback, useEffect, useMemo, useState, type JSX } from 'react';
import {
  describeDue,
  isOpen,
  MAX_TASK_TITLE,
  planHeadline,
  sortForDisplay,
  taskDay,
  upcomingReminders,
  type Task,
} from '@mochi/core';
import { button, C, input } from '../ui.js';

/**
 * Tasks and reminders — the dated, one-off half of "handle my day".
 *
 * Separate from Routines on purpose. A routine is a shape of life that repeats
 * every Tuesday; a task happens once, on a date, and then it is gone. Putting
 * "call the dentist back before Thursday" into a weekly recurrence editor is
 * how a companion turns into a project management tool.
 *
 * A reminder is opt-in. Most tasks want a day, not a moment — being pinged at
 * a precise time for something that just needs doing sometime this week is how
 * people learn to ignore an app.
 */

type Filter = 'open' | 'today' | 'done';

/** `2026-08-04` → a local Date at midnight, not a UTC one a day out. */
function parseDay(day: string): Date {
  const [y, m, d] = day.split('-');
  return new Date(Number(y), Number(m) - 1, Number(d));
}

/** Combine the date and time fields into epoch ms, or null if either is blank. */
function toRemindAt(day: string, time: string): number | null {
  if (day.length === 0 || time.length === 0) return null;
  const [h, min] = time.split(':');
  const at = parseDay(day);
  at.setHours(Number(h), Number(min), 0, 0);
  const ms = at.getTime();
  return Number.isFinite(ms) ? ms : null;
}

const QUICK_DAYS: readonly { label: string; addDays: number | null }[] = [
  { label: 'Today', addDays: 0 },
  { label: 'Tomorrow', addDays: 1 },
  { label: 'Next week', addDays: 7 },
  { label: 'Someday', addDays: null },
];

export function TasksTab(): JSX.Element {
  const [tasks, setTasks] = useState<readonly Task[]>([]);
  const [now, setNow] = useState(() => new Date());
  const [filter, setFilter] = useState<Filter>('open');
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  /** Only for the greeting. Real name or nothing -- never a placeholder. */
  const [userName, setUserName] = useState('');

  // Composer
  const [title, setTitle] = useState('');
  const [dueDay, setDueDay] = useState(() => taskDay(new Date()));
  const [remindTime, setRemindTime] = useState('');

  useEffect(() => {
    void window.mochi.tasks.list().then(setTasks);
    void window.mochi.settings.get().then((s) => setUserName(s.userName.trim()));
    const off = window.mochi.tasks.onChange(setTasks);
    // "in 20 min" stops being true a minute later unless something re-renders.
    const tick = setInterval(() => setNow(new Date()), 30_000);
    return () => {
      off();
      clearInterval(tick);
    };
  }, []);

  const visible = useMemo(() => {
    const today = taskDay(now);
    const chosen = tasks.filter((t) => {
      if (filter === 'done') return !isOpen(t);
      if (filter === 'today') return isOpen(t) && t.dueOn !== null && t.dueOn <= today;
      return isOpen(t);
    });
    return sortForDisplay(chosen, now);
  }, [tasks, filter, now]);

  /**
   * The list, cut into the four groups people actually think in.
   *
   * One flat list sorted by urgency reads as a wall — "overdue since 2026-08-01"
   * on every other row, with nothing to tell you where the day ends and the
   * backlog begins. Empty groups are dropped rather than shown empty.
   */
  const groups = useMemo(() => {
    const today = taskDay(now);
    const buckets: { label: string; tasks: Task[]; accent?: boolean }[] = [
      { label: 'Overdue', tasks: [], accent: true },
      { label: 'Today', tasks: [] },
      { label: 'Later', tasks: [] },
      { label: 'Someday', tasks: [] },
    ];

    for (const t of visible) {
      if (!isOpen(t)) {
        buckets[1]!.tasks.push(t);
        continue;
      }
      if (t.dueOn === null) buckets[3]!.tasks.push(t);
      else if (t.dueOn < today) buckets[0]!.tasks.push(t);
      else if (t.dueOn === today) buckets[1]!.tasks.push(t);
      else buckets[2]!.tasks.push(t);
    }

    // "Done" is one undivided list; splitting finished work by due date says
    // nothing useful.
    if (filter === 'done') return [{ label: 'Completed', tasks: [...visible], accent: false }];
    return buckets.filter((b) => b.tasks.length > 0);
  }, [visible, now, filter]);

  const nextReminder = useMemo(() => upcomingReminders(tasks, now)[0] ?? null, [tasks, now]);
  const openCount = useMemo(() => tasks.filter(isOpen).length, [tasks]);

  const add = useCallback(async () => {
    const text = title.trim();
    if (text.length === 0) return;
    const remindAt = toRemindAt(dueDay, remindTime);
    await window.mochi.tasks.create(text, dueDay.length === 0 ? null : dueDay, null, remindAt);
    setTitle('');
    setRemindTime('');
  }, [title, dueDay, remindTime]);

  const setQuickDay = useCallback((addDays: number | null) => {
    if (addDays === null) {
      setDueDay('');
      // A someday task cannot have a moment attached to it.
      setRemindTime('');
      return;
    }
    const day = new Date();
    day.setDate(day.getDate() + addDays);
    setDueDay(taskDay(day));
  }, []);

  const clearReminder = useCallback(async (id: string) => {
    await window.mochi.tasks.update(id, { remindAt: null });
  }, []);

  const tooLong = title.trim().length > MAX_TASK_TITLE;

  const greeting = useMemo(() => {
    const h = now.getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  }, [now]);

  const dueTodayCount = useMemo(() => {
    const today = taskDay(now);
    return tasks.filter((t) => isOpen(t) && t.dueOn === today).length;
  }, [tasks, now]);

  const reminderCount = useMemo(() => upcomingReminders(tasks, now).length, [tasks, now]);

  return (
    <div>
      {/*
        The header states the day rather than decorating it. Every number here
        is counted from the list, and planHeadline() changes when the list
        does — a fixed encouraging phrase would be decoration, and one that
        called the day light while four things were overdue would be worse.
      */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 20,
          marginBottom: 22,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.09em',
              textTransform: 'uppercase',
              color: C.dim,
              marginBottom: 8,
            }}
          >
            {greeting}
            {userName.length > 0 ? `, ${userName}` : ''}
          </div>
          <div
            style={{
              fontSize: 27,
              fontWeight: 700,
              letterSpacing: '-0.02em',
              color: C.text,
              lineHeight: 1.15,
            }}
          >
            {planHeadline(tasks, now)}
          </div>
          {nextReminder !== null && (
            <div style={{ fontSize: 12.5, color: C.dim, marginTop: 8 }}>
              Mochi will nudge you about{' '}
              <strong style={{ color: C.text, fontWeight: 600 }}>{nextReminder.title}</strong>{' '}
              {describeDue(nextReminder, now)}.
            </div>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            padding: '10px 14px',
            borderRadius: 10,
            background: 'rgba(255, 255, 255, 0.03)',
            fontSize: 12,
            color: C.dim,
            whiteSpace: 'nowrap',
            flexShrink: 0,
            textAlign: 'right',
          }}
        >
          <span>
            <strong style={{ color: C.text, fontWeight: 650 }}>{dueTodayCount}</strong> due today
          </span>
          <span>
            <strong style={{ color: C.text, fontWeight: 650 }}>{reminderCount}</strong>{' '}
            {reminderCount === 1 ? 'reminder' : 'reminders'}
          </span>
        </div>
      </div>

      {/* Composer. One line, because adding a task should cost one line. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
          marginBottom: 10,
        }}
      >
        <input
          style={{ ...input, flex: 1, minWidth: 220, marginBottom: 0 }}
          placeholder="What needs doing?"
          value={title}
          maxLength={MAX_TASK_TITLE + 20}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void add();
          }}
        />
        <input
          type="date"
          title="Due date"
          style={{ ...input, width: 148, marginBottom: 0 }}
          value={dueDay}
          onChange={(e) => setDueDay(e.target.value)}
        />
        <input
          type="time"
          title={
            dueDay.length === 0
              ? 'Pick a date first — a reminder needs a day to land on'
              : 'Remind me at this time (optional)'
          }
          disabled={dueDay.length === 0}
          style={{
            ...input,
            width: 110,
            marginBottom: 0,
            opacity: dueDay.length === 0 ? 0.45 : 1,
          }}
          value={remindTime}
          onChange={(e) => setRemindTime(e.target.value)}
        />
        <button
          type="button"
          style={button('primary')}
          disabled={title.trim().length === 0 || tooLong}
          onClick={() => void add()}
        >
          Add
        </button>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          flexWrap: 'wrap',
          marginBottom: 20,
        }}
      >
        {QUICK_DAYS.map((quick) => {
          const applied =
            quick.addDays === null
              ? dueDay.length === 0
              : (() => {
                  const day = new Date();
                  day.setDate(day.getDate() + quick.addDays);
                  return dueDay === taskDay(day);
                })();
          return (
            <button
              key={quick.label}
              type="button"
              onClick={() => setQuickDay(quick.addDays)}
              style={{
                ...button('ghost'),
                padding: '3px 10px',
                fontSize: 11.5,
                color: applied ? C.accent : C.dim,
                borderColor: applied ? C.accent : C.border,
              }}
            >
              {quick.label}
            </button>
          );
        })}
        {tooLong && (
          <span style={{ fontSize: 11.5, color: C.warn }}>
            Keep it under {MAX_TASK_TITLE} characters.
          </span>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 4,
        }}
      >
        <div style={{ display: 'flex', gap: 4 }}>
          {(['open', 'today', 'done'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              style={{
                ...button('ghost'),
                padding: '3px 11px',
                fontSize: 11.5,
                color: filter === f ? C.text : C.dim,
                borderColor: filter === f ? C.accent : 'transparent',
                textTransform: 'capitalize',
              }}
            >
              {f}
            </button>
          ))}
        </div>
        <span style={{ fontSize: 11.5, color: C.faint }}>{openCount} open</span>
      </div>

      {visible.length === 0 ? (
        <div style={{ fontSize: 13, color: C.faint, padding: '20px 10px' }}>
          {filter === 'done'
            ? 'Nothing ticked off yet.'
            : filter === 'today'
              ? 'Nothing due today.'
              : 'No open tasks. Add one above.'}
        </div>
      ) : (
        <div>
          {groups.map((group) => (
            <div key={group.label} style={{ marginBottom: 18 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 10.5,
                  fontWeight: 650,
                  letterSpacing: '0.09em',
                  textTransform: 'uppercase',
                  color: group.accent === true ? C.warn : C.dim,
                  padding: '0 10px 8px',
                }}
              >
                <span>{group.label}</span>
                <span style={{ color: C.faint, letterSpacing: 0 }}>{group.tasks.length}</span>
              </div>

              {group.tasks.map((task, index) => {
                const done = !isOpen(task);
                const late = isOpen(task) && task.dueOn !== null && task.dueOn < taskDay(now);
                const asking = confirmDelete === task.id;
                const showSecondary = hoveredRow === task.id || asking;
                const isLastInGroup = index === group.tasks.length - 1;

                return (
                  <div
                    key={task.id}
                    onMouseEnter={() => setHoveredRow(task.id)}
                    onMouseLeave={() => setHoveredRow(null)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '11px 10px',
                      borderRadius: 8,
                      background:
                        hoveredRow === task.id ? 'rgba(255, 255, 255, 0.025)' : 'transparent',
                      boxShadow: isLastInGroup
                        ? 'none'
                        : 'inset 0 -1px 0 rgba(255, 255, 255, 0.045)',
                      transition: 'background 140ms ease',
                    }}
                  >
                    <button
                      type="button"
                      aria-label={done ? `Reopen ${task.title}` : `Complete ${task.title}`}
                      onClick={() => void window.mochi.tasks.toggle(task.id)}
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: '50%',
                        flexShrink: 0,
                        cursor: 'pointer',
                        background: done ? C.accent : 'transparent',
                        // Thicker ring when overdue: the row already reads as late,
                        // and the control you need is the one that clears it.
                        border: `1px solid ${done ? C.accent : late ? C.warn : C.border}`,
                        color: '#241f2b',
                        fontSize: 10,
                        lineHeight: 1,
                        padding: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'background 140ms ease, border-color 140ms ease',
                      }}
                    >
                      {done ? '✓' : ''}
                    </button>

                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontSize: 13.5,
                        color: done ? C.faint : C.text,
                        textDecoration: done ? 'line-through' : 'none',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                      title={task.title}
                    >
                      {task.title}
                    </span>

                    {task.remindAt !== null && isOpen(task) && (
                      <span
                        style={{ fontSize: 11, color: C.dim, flexShrink: 0 }}
                        title="Mochi will remind you"
                      >
                        ⏰
                      </span>
                    )}

                    {/* Numbers and hover actions share one slot, so there is no
                    permanent gap where the buttons will eventually appear. */}
                    <div style={{ position: 'relative', width: 208, height: 30, flexShrink: 0 }}>
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'flex-end',
                          fontSize: 11.5,
                          color: late ? C.warn : C.faint,
                          opacity: showSecondary ? 0 : 1,
                          transition: 'opacity 140ms ease',
                          pointerEvents: 'none',
                        }}
                      >
                        {done ? 'done' : describeDue(task, now)}
                      </div>

                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'flex-end',
                          gap: 6,
                          opacity: showSecondary ? 1 : 0,
                          pointerEvents: showSecondary ? 'auto' : 'none',
                          transition: 'opacity 140ms ease',
                        }}
                      >
                        {asking ? (
                          <>
                            <span style={{ fontSize: 11.5, color: C.warn, fontWeight: 600 }}>
                              Delete?
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setConfirmDelete(null);
                                void window.mochi.tasks.remove(task.id);
                              }}
                              style={{
                                ...button('ghost'),
                                padding: '3px 9px',
                                fontSize: 11.5,
                                color: C.warn,
                                borderColor: C.warn,
                              }}
                            >
                              Delete
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDelete(null)}
                              style={{ ...button('ghost'), padding: '3px 9px', fontSize: 11.5 }}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            {late && (
                              <button
                                type="button"
                                title="Move to today"
                                onClick={() => void window.mochi.tasks.rollForward(task.id)}
                                style={{ ...button('ghost'), padding: '3px 9px', fontSize: 11.5 }}
                              >
                                Today
                              </button>
                            )}
                            {task.remindAt !== null && (
                              <button
                                type="button"
                                title="Stop reminding me about this"
                                onClick={() => void clearReminder(task.id)}
                                style={{ ...button('ghost'), padding: '3px 9px', fontSize: 11.5 }}
                              >
                                Mute
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setConfirmDelete(task.id)}
                              title={`Delete ${task.title}`}
                              style={{
                                ...button('ghost'),
                                padding: '3px 7px',
                                fontSize: 11.5,
                                borderColor: 'transparent',
                                color: C.faint,
                              }}
                            >
                              🗑
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
