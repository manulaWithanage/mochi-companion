import { useCallback, useEffect, useRef, useMemo, useState, type JSX } from 'react';
import {
  describeDue,
  describeWhen,
  isOpen,
  MAX_TASK_TITLE,
  parseWhen,
  planHeadline,
  sortForDisplay,
  taskDay,
  upcomingReminders,
  type Task,
} from '@mochi/core';
import { button, C, input } from '../ui.js';

type Filter = 'open' | 'today' | 'done';

/** `2026-08-04` → a local Date at midnight, not a UTC one a day out. */
function parseDay(day: string): Date {
  const [y, m, d] = day.split('-');
  return new Date(Number(y), Number(m) - 1, Number(d));
}

/** Combine date and time fields into epoch ms, or null if blank. */
function toRemindAt(day: string, time: string): number | null {
  if (day.length === 0 || time.length === 0) return null;
  const [h, min] = time.split(':');
  const at = parseDay(day);
  at.setHours(Number(h), Number(min), 0, 0);
  const ms = at.getTime();
  return Number.isFinite(ms) ? ms : null;
}

function formatTimeOnly(epochMs: number): string {
  const d = new Date(epochMs);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const TIME_PRESETS: readonly { label: string; value: string }[] = [
  { label: '9:00 AM', value: '09:00' },
  { label: '12:00 PM', value: '12:00' },
  { label: '3:00 PM', value: '15:00' },
  { label: '6:00 PM', value: '18:00' },
  { label: '9:00 PM', value: '21:00' },
];

const MORE_TIMES: readonly { label: string; value: string }[] = [
  { label: '8:00 AM', value: '08:00' },
  { label: '9:30 AM', value: '09:30' },
  { label: '10:00 AM', value: '10:00' },
  { label: '11:00 AM', value: '11:00' },
  { label: '1:00 PM', value: '13:00' },
  { label: '2:00 PM', value: '14:00' },
  { label: '4:00 PM', value: '16:00' },
  { label: '5:00 PM', value: '17:00' },
  { label: '7:00 PM', value: '19:00' },
  { label: '8:00 PM', value: '20:00' },
];

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
  const [userName, setUserName] = useState('');
  const [isTimerRunning, setIsTimerRunning] = useState(false);

  // Composer
  const [title, setTitle] = useState('');
  const [dueDay, setDueDay] = useState(() => taskDay(new Date()));
  const [remindTime, setRemindTime] = useState('');
  /** Set by "undo" so the typed words stay but stop being read as a date. */
  const [ignoreParsed, setIgnoreParsed] = useState(false);
  const [showExact, setShowExact] = useState(false);
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void window.mochi.tasks.list().then(setTasks);
    void window.mochi.settings.get().then((s) => setUserName(s.userName.trim()));
    void window.mochi.timer.current().then((s) => setIsTimerRunning(s.running));

    const offTasks = window.mochi.tasks.onChange(setTasks);
    const offTimer = window.mochi.timer.onChange((s) => setIsTimerRunning(s.running));
    const tick = setInterval(() => setNow(new Date()), 30_000);

    return () => {
      offTasks();
      offTimer();
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

    if (filter === 'done') return [{ label: 'Completed', tasks: [...visible], accent: false }];
    return buckets.filter((b) => b.tasks.length > 0);
  }, [visible, now, filter]);

  const nextReminder = useMemo(() => upcomingReminders(tasks, now)[0] ?? null, [tasks, now]);
  const openCount = useMemo(() => tasks.filter(isOpen).length, [tasks]);

  /**
   * What the typed text was understood to mean.
   *
   * Recomputed on every keystroke so the chip below the field tracks what is
   * actually about to be saved. `ignoreParsed` is the escape hatch: it keeps
   * the words and drops the interpretation, for the day someone genuinely
   * wants a task called "Ship it friday".
   */
  const parsed = useMemo(() => parseWhen(title, now), [title, now]);
  const detected = !ignoreParsed && parsed.matched.length > 0;

  /** The title as it will be stored: the phrase is stripped only if it is used. */
  const cleanTitle = detected ? parsed.title : title.trim();

  // Typing again after "undo" is a new sentence, so re-arm the parser.
  useEffect(() => {
    setIgnoreParsed(false);
  }, [title]);

  const add = useCallback(async () => {
    if (cleanTitle.length === 0) return;

    // The chip is the contract: whatever it says is what gets saved.
    const day = detected ? parsed.dueOn : dueDay.length === 0 ? null : dueDay;
    const remindAt = detected ? parsed.remindAt : toRemindAt(dueDay, remindTime);

    await window.mochi.tasks.create(cleanTitle, day, null, remindAt);
    setTitle('');
    setRemindTime('');
  }, [cleanTitle, detected, parsed, dueDay, remindTime]);

  const setQuickDay = useCallback((addDays: number | null) => {
    if (addDays === null) {
      setDueDay('');
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

  const toggleFocusTimer = useCallback(async () => {
    if (isTimerRunning) {
      await window.mochi.timer.stop();
    } else {
      // No id: the main process fills in the default project. This used to pass
      // the literal 'general', which is not a project id -- the real one is
      // 'default' -- so the session could never be written and the tracked time
      // was lost on stop.
      await window.mochi.timer.toggle();
    }
  }, [isTimerRunning]);

  const tooLong = title.trim().length > MAX_TASK_TITLE;

  const greeting = useMemo(() => {
    const h = now.getHours();
    if (h < 12) return 'GOOD MORNING';
    if (h < 18) return 'GOOD AFTERNOON';
    return 'GOOD EVENING';
  }, [now]);

  const dueTodayCount = useMemo(() => {
    const today = taskDay(now);
    return tasks.filter((t) => isOpen(t) && t.dueOn === today).length;
  }, [tasks, now]);

  const reminderCount = useMemo(() => upcomingReminders(tasks, now).length, [tasks, now]);

  // Top priorities for the dashboard card
  const topPriorities = useMemo(() => {
    return tasks.filter(isOpen).slice(0, 3);
  }, [tasks]);

  return (
    <div style={{ color: C.text }}>
      {/* Hero Greeting & Stats Summary Bar (Image 2 style) */}
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
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: C.dim,
              marginBottom: 6,
            }}
          >
            {greeting}
            {userName.length > 0 ? `, ${userName.toUpperCase()}` : ''}
          </div>
          <div
            style={{
              fontSize: 30,
              fontWeight: 800,
              letterSpacing: '-0.03em',
              color: C.text,
              lineHeight: 1.15,
            }}
          >
            {planHeadline(tasks, now)}
          </div>
        </div>

        {/* Top Right Summary Badge Widget */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '10px 18px',
            borderRadius: 14,
            background: 'rgba(255, 255, 255, 0.035)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            backdropFilter: 'blur(12px)',
            fontSize: 13,
            color: C.dim,
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          <div>
            <strong style={{ color: C.text, fontWeight: 700 }}>{dueTodayCount}</strong>{' '}
            {dueTodayCount === 1 ? 'priority' : 'priorities'}
          </div>
          <span style={{ color: 'rgba(255, 255, 255, 0.2)' }}>•</span>
          <div>
            <strong style={{ color: C.text, fontWeight: 700 }}>{reminderCount}</strong>{' '}
            {reminderCount === 1 ? 'reminder' : 'reminders'}
          </div>
        </div>
      </div>

      {/* 3-Column Executive Card Grid (Inspired by Image 2) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.15fr 1fr 1fr',
          gap: 16,
          marginBottom: 24,
        }}
      >
        {/* Card 1: TOP PRIORITIES */}
        <div
          style={{
            padding: '18px 20px',
            borderRadius: 16,
            background: 'rgba(28, 23, 34, 0.65)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            backdropFilter: 'blur(16px)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            minHeight: 165,
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
          }}
        >
          <div>
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 750,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: C.dim,
                marginBottom: 12,
              }}
            >
              TOP PRIORITIES
            </div>

            {topPriorities.length === 0 ? (
              <div style={{ fontSize: 13, color: C.faint, fontStyle: 'italic', padding: '4px 0' }}>
                All clear! No open tasks left.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {topPriorities.map((t) => (
                  <div
                    key={t.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <button
                        type="button"
                        onClick={() => void window.mochi.tasks.toggle(t.id)}
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: '50%',
                          background: C.accent,
                          border: 'none',
                          color: '#241f2b',
                          fontSize: 11,
                          fontWeight: 800,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          flexShrink: 0,
                        }}
                      >
                        ✓
                      </button>
                      <span
                        style={{
                          fontSize: 13.5,
                          fontWeight: 500,
                          color: C.text,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {t.title}
                      </span>
                    </div>
                    <span style={{ fontSize: 11.5, color: C.faint, flexShrink: 0 }}>
                      {t.remindAt !== null ? formatTimeOnly(t.remindAt) : (t.dueOn ?? 'today')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => titleInputRef.current?.focus()}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              marginTop: 12,
              fontSize: 12.5,
              fontWeight: 650,
              color: C.accent,
              cursor: 'pointer',
              textAlign: 'left',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            + Add something small
          </button>
        </div>

        {/* Card 2: UP NEXT */}
        <div
          style={{
            padding: '18px 20px',
            borderRadius: 16,
            background: 'rgba(28, 23, 34, 0.65)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            backdropFilter: 'blur(16px)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            minHeight: 165,
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
          }}
        >
          <div>
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 750,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: C.dim,
                marginBottom: 10,
              }}
            >
              UP NEXT
            </div>

            {nextReminder !== null ? (
              <>
                <div
                  style={{
                    fontSize: 25,
                    fontWeight: 800,
                    color: C.accent,
                    letterSpacing: '-0.02em',
                    lineHeight: 1.2,
                    marginBottom: 4,
                  }}
                >
                  {formatTimeOnly(nextReminder.remindAt!)}
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 650, color: C.text, marginBottom: 2 }}>
                  {nextReminder.title}
                </div>
                <div style={{ fontSize: 12, color: C.dim }}>Reminder set for today</div>
              </>
            ) : (
              <>
                <div
                  style={{
                    fontSize: 25,
                    fontWeight: 800,
                    color: C.accent,
                    letterSpacing: '-0.02em',
                    lineHeight: 1.2,
                    marginBottom: 4,
                  }}
                >
                  Focus Time
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 650, color: C.text, marginBottom: 2 }}>
                  Deep Work Block
                </div>
                <div style={{ fontSize: 12, color: C.dim }}>No upcoming pings scheduled</div>
              </>
            )}
          </div>

          <div
            style={{
              paddingTop: 10,
              borderTop: '1px solid rgba(255, 255, 255, 0.06)',
              fontSize: 11.5,
              color: C.faint,
            }}
          >
            {nextReminder !== null ? describeDue(nextReminder, now) : 'Focus block active & clear'}
          </div>
        </div>

        {/* Card 3: MOCHI'S NOTE */}
        <div
          style={{
            padding: '18px 20px',
            borderRadius: 16,
            background: 'rgba(28, 23, 34, 0.65)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            backdropFilter: 'blur(16px)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            minHeight: 165,
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
          }}
        >
          <div>
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 750,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: C.dim,
                marginBottom: 10,
              }}
            >
              MOCHI'S NOTE
            </div>

            <div
              style={{
                fontSize: 14.5,
                fontWeight: 700,
                color: C.text,
                lineHeight: 1.3,
                marginBottom: 6,
              }}
            >
              {topPriorities.length > 0
                ? `Start with ${topPriorities[0]!.title}.`
                : 'Enjoy your open schedule!'}
            </div>

            <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.4 }}>
              {dueTodayCount > 0
                ? `You have ${dueTodayCount} items due today. Knock out top priority first.`
                : 'Great pace today. Ready whenever you want to begin a focus block.'}
            </div>
          </div>

          <button
            type="button"
            onClick={() => void toggleFocusTimer()}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              marginTop: 12,
              fontSize: 12.5,
              fontWeight: 700,
              color: isTimerRunning ? C.warn : C.accent,
              cursor: 'pointer',
              textAlign: 'left',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {isTimerRunning ? 'Pause focus' : 'Start focus session'}
          </button>
        </div>
      </div>

      {/* Main Task Composer Bar */}
      <div
        style={{
          padding: '14px 16px',
          borderRadius: 14,
          background: 'rgba(255, 255, 255, 0.025)',
          border: `1px solid ${detected ? 'rgba(242, 166, 179, 0.35)' : 'rgba(255, 255, 255, 0.06)'}`,
          marginBottom: 16,
          transition: 'border-color 160ms ease',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
            marginBottom: 10,
          }}
        >
          <input
            ref={titleInputRef}
            style={{
              ...input,
              flex: 1,
              minWidth: 240,
              marginBottom: 0,
              background: 'rgba(0, 0, 0, 0.25)',
              borderColor: 'rgba(255, 255, 255, 0.12)',
            }}
            placeholder="What needs doing?  —  try “call the dentist tomorrow 3pm”"
            value={title}
            maxLength={MAX_TASK_TITLE + 40}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void add();
            }}
          />
          <button
            type="button"
            style={{
              ...button('primary'),
              padding: '9px 20px',
              borderRadius: 10,
              fontWeight: 700,
            }}
            disabled={cleanTitle.length === 0 || tooLong}
            onClick={() => void add()}
          >
            Add Task
          </button>
        </div>

        {/*
          What the typed text was understood to mean.
        */}
        {detected && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 10,
              fontSize: 12.5,
              color: C.dim,
            }}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '3px 10px',
                borderRadius: 999,
                background: 'rgba(242, 166, 179, 0.14)',
                border: `1px solid ${C.accent}`,
                color: C.accent,
                fontWeight: 600,
              }}
            >
              {parsed.remindAt === null ? 'Due' : 'Remind'} {describeWhen(parsed, now)}
            </span>
            <span>
              from “{parsed.matched}” — saving as{' '}
              <strong style={{ color: C.text }}>{cleanTitle}</strong>
            </span>
            <button
              type="button"
              title="Keep the words, drop the date"
              onClick={() => setIgnoreParsed(true)}
              style={{
                ...button('ghost'),
                padding: '2px 8px',
                fontSize: 11,
                borderColor: 'transparent',
                color: C.faint,
              }}
            >
              undo
            </button>
          </div>
        )}

        {/* Quick day pills, then times once a day exists to hang them on. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          {QUICK_DAYS.map((quick) => {
            const applied =
              !detected &&
              (quick.addDays === null
                ? dueDay.length === 0
                : (() => {
                    const day = new Date();
                    day.setDate(day.getDate() + quick.addDays);
                    return dueDay === taskDay(day);
                  })());
            return (
              <button
                key={quick.label}
                type="button"
                disabled={detected}
                onClick={() => setQuickDay(quick.addDays)}
                style={{
                  ...button('ghost'),
                  padding: '4px 12px',
                  fontSize: 12,
                  borderRadius: 20,
                  opacity: detected ? 0.4 : 1,
                  color: applied ? C.accent : C.dim,
                  borderColor: applied ? C.accent : 'rgba(255, 255, 255, 0.1)',
                  background: applied ? 'rgba(242, 166, 179, 0.12)' : 'transparent',
                }}
              >
                {quick.label}
              </button>
            );
          })}

          <span style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.09)' }} />

          {/*
            Reminder times as one click each. The old control was a native
            <input type="time">, which is four interactions for "3pm" and looks
            like a browser rather than like Mochi.
          */}
          {TIME_PRESETS.map((preset) => {
            const applied = !detected && remindTime === preset.value;
            return (
              <button
                key={preset.label}
                type="button"
                disabled={detected || dueDay.length === 0}
                title={
                  dueDay.length === 0 ? 'Pick a day first — a reminder needs one' : preset.label
                }
                onClick={() => setRemindTime(remindTime === preset.value ? '' : preset.value)}
                style={{
                  ...button('ghost'),
                  padding: '4px 10px',
                  fontSize: 12,
                  borderRadius: 20,
                  opacity: detected || dueDay.length === 0 ? 0.35 : 1,
                  color: applied ? C.accent : C.dim,
                  borderColor: applied ? C.accent : 'rgba(255, 255, 255, 0.1)',
                  background: applied ? 'rgba(242, 166, 179, 0.12)' : 'transparent',
                }}
              >
                {preset.label}
              </button>
            );
          })}

          {/* The escape hatch for a date no shortcut covers. */}
          <button
            type="button"
            onClick={() => setShowExact((v) => !v)}
            style={{
              ...button('ghost'),
              padding: '4px 10px',
              fontSize: 12,
              borderRadius: 20,
              borderColor: 'transparent',
              color: C.faint,
            }}
          >
            {showExact ? 'hide picker' : 'pick exact…'}
          </button>

          {tooLong && (
            <span style={{ fontSize: 12, color: C.warn, marginLeft: 8 }}>
              Keep it under {MAX_TASK_TITLE} characters.
            </span>
          )}
        </div>

        {showExact && !detected && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              marginTop: 12,
              paddingTop: 12,
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  color: C.dim,
                  textTransform: 'uppercase',
                  marginRight: 4,
                }}
              >
                More Times:
              </span>
              {MORE_TIMES.map((preset) => {
                const applied = !detected && remindTime === preset.value;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    disabled={detected || dueDay.length === 0}
                    title={dueDay.length === 0 ? 'Pick a day first' : preset.label}
                    onClick={() => setRemindTime(remindTime === preset.value ? '' : preset.value)}
                    style={{
                      ...button('ghost'),
                      padding: '3px 9px',
                      fontSize: 11.5,
                      borderRadius: 16,
                      opacity: detected || dueDay.length === 0 ? 0.35 : 1,
                      color: applied ? C.accent : C.dim,
                      borderColor: applied ? C.accent : 'rgba(255, 255, 255, 0.1)',
                      background: applied ? 'rgba(242, 166, 179, 0.12)' : 'transparent',
                    }}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12, color: C.dim }}>Date:</span>
                <input
                  type="date"
                  title="Due date"
                  style={{
                    ...input,
                    width: 155,
                    marginBottom: 0,
                    colorScheme: 'dark',
                    background: 'rgba(0, 0, 0, 0.4)',
                    borderColor: dueDay ? C.accent : 'rgba(255, 255, 255, 0.15)',
                    borderRadius: 10,
                    fontSize: 13,
                  }}
                  value={dueDay}
                  onChange={(e) => setDueDay(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12, color: C.dim }}>Time:</span>
                <input
                  type="time"
                  title={dueDay.length === 0 ? 'Pick a date first' : 'Remind me at this time'}
                  disabled={dueDay.length === 0}
                  style={{
                    ...input,
                    width: 125,
                    marginBottom: 0,
                    colorScheme: 'dark',
                    background: 'rgba(0, 0, 0, 0.4)',
                    borderColor: remindTime ? C.accent : 'rgba(255, 255, 255, 0.15)',
                    borderRadius: 10,
                    fontSize: 13,
                    opacity: dueDay.length === 0 ? 0.45 : 1,
                  }}
                  value={remindTime}
                  onChange={(e) => setRemindTime(e.target.value)}
                />
              </div>

              {dueDay.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setDueDay('');
                    setRemindTime('');
                  }}
                  style={{
                    ...button('ghost'),
                    padding: '4px 10px',
                    fontSize: 11.5,
                    color: C.warn,
                    borderColor: 'rgba(255, 179, 193, 0.3)',
                  }}
                >
                  Clear Date & Time
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Task Filters & Task Counts Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
          padding: '0 4px',
        }}
      >
        <div style={{ display: 'flex', gap: 6 }}>
          {(['open', 'today', 'done'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              style={{
                ...button('ghost'),
                padding: '5px 14px',
                fontSize: 12.5,
                fontWeight: filter === f ? 700 : 500,
                borderRadius: 20,
                color: filter === f ? C.text : C.dim,
                background: filter === f ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                borderColor: filter === f ? C.accent : 'transparent',
                textTransform: 'capitalize',
              }}
            >
              {f}
            </button>
          ))}
        </div>
        <span style={{ fontSize: 12, color: C.faint }}>{openCount} open tasks</span>
      </div>

      {/* Task Lists */}
      {visible.length === 0 ? (
        <div
          style={{
            fontSize: 13.5,
            color: C.faint,
            padding: '36px 12px',
            textAlign: 'center',
            borderRadius: 14,
            background: 'rgba(255, 255, 255, 0.015)',
            border: '1px dashed rgba(255, 255, 255, 0.06)',
          }}
        >
          {filter === 'done'
            ? 'Nothing ticked off yet.'
            : filter === 'today'
              ? 'Nothing due today. Enjoy your day!'
              : 'No open tasks. Add one above to get started.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {groups.map((group) => (
            <div key={group.label}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 11,
                  fontWeight: 750,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: group.accent === true ? C.warn : C.dim,
                  padding: '0 8px 10px',
                }}
              >
                <span>{group.label}</span>
                <span
                  style={{
                    fontSize: 10,
                    padding: '1px 7px',
                    borderRadius: 10,
                    background:
                      group.accent === true
                        ? 'rgba(255, 179, 193, 0.15)'
                        : 'rgba(255, 255, 255, 0.08)',
                    color: group.accent === true ? C.warn : C.faint,
                  }}
                >
                  {group.tasks.length}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {group.tasks.map((task) => {
                  const done = !isOpen(task);
                  const late = isOpen(task) && task.dueOn !== null && task.dueOn < taskDay(now);
                  const asking = confirmDelete === task.id;
                  const showSecondary = hoveredRow === task.id || asking;

                  return (
                    <div
                      key={task.id}
                      onMouseEnter={() => setHoveredRow(task.id)}
                      onMouseLeave={() => setHoveredRow(null)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                        padding: '12px 16px',
                        borderRadius: 12,
                        background:
                          hoveredRow === task.id
                            ? 'rgba(255, 255, 255, 0.04)'
                            : 'rgba(255, 255, 255, 0.02)',
                        border: '1px solid rgba(255, 255, 255, 0.04)',
                        transition: 'all 140ms ease',
                      }}
                    >
                      <button
                        type="button"
                        aria-label={done ? `Reopen ${task.title}` : `Complete ${task.title}`}
                        onClick={() => void window.mochi.tasks.toggle(task.id)}
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: '50%',
                          flexShrink: 0,
                          cursor: 'pointer',
                          background: done ? C.accent : 'transparent',
                          border: `1.5px solid ${done ? C.accent : late ? C.warn : 'rgba(255, 255, 255, 0.25)'}`,
                          color: '#241f2b',
                          fontSize: 11,
                          fontWeight: 800,
                          lineHeight: 1,
                          padding: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 140ms ease',
                        }}
                      >
                        {done ? '✓' : ''}
                      </button>

                      <span
                        style={{
                          flex: 1,
                          minWidth: 0,
                          fontSize: 14,
                          fontWeight: done ? 400 : 500,
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
                          style={{ fontSize: 12, color: C.accent, flexShrink: 0 }}
                          title="Mochi will remind you"
                        >
                          remind {formatTimeOnly(task.remindAt)}
                        </span>
                      )}

                      <div style={{ position: 'relative', width: 180, height: 28, flexShrink: 0 }}>
                        <div
                          style={{
                            position: 'absolute',
                            inset: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                            fontSize: 12,
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
                              <span style={{ fontSize: 12, color: C.warn, fontWeight: 700 }}>
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
                                  padding: '4px 10px',
                                  fontSize: 12,
                                  color: C.warn,
                                  borderColor: C.warn,
                                }}
                              >
                                Delete
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDelete(null)}
                                style={{ ...button('ghost'), padding: '4px 10px', fontSize: 12 }}
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
                                  style={{ ...button('ghost'), padding: '3px 10px', fontSize: 12 }}
                                >
                                  Today
                                </button>
                              )}
                              {task.remindAt !== null && (
                                <button
                                  type="button"
                                  title="Stop reminding me about this"
                                  onClick={() => void clearReminder(task.id)}
                                  style={{ ...button('ghost'), padding: '3px 10px', fontSize: 12 }}
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
                                  padding: '3px 8px',
                                  fontSize: 12,
                                  borderColor: 'transparent',
                                  color: C.faint,
                                }}
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
