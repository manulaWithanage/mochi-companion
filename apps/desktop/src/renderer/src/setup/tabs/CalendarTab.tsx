import { useCallback, useEffect, useMemo, useState, type JSX } from 'react';
import {
  buildDayRecords,
  clockLabel,
  composeBriefing,
  conflicts,
  dayShape,
  describeImpact,
  eventsOnDay,
  freeBlocks,
  summarise,
  upcoming,
  workWindow,
  type CalendarEvent,
  type CalendarStatus,
  type GoogleStatus,
  type MochiSettings,
  type Task,
  type WorkSession,
} from '@mochi/core';
import { button, C, card, h2, humanDuration, input, label, sub, WEEKDAYS } from '../ui.js';
import { GoogleWizard } from '../GoogleWizard.js';

const RETRO_DAYS = 30;

const Stat = ({
  value,
  caption,
  accent,
  color,
  icon,
}: {
  readonly value: string;
  readonly caption: string;
  readonly accent?: boolean;
  readonly color?: string;
  readonly icon?: JSX.Element;
}): JSX.Element => (
  <div
    style={{
      ...card,
      flex: 1,
      padding: '14px 16px',
      background: 'linear-gradient(145deg, rgba(36, 31, 43, 0.95) 0%, rgba(27, 23, 32, 0.9) 100%)',
      borderColor: accent === true ? 'rgba(242, 166, 179, 0.35)' : 'rgba(255, 255, 255, 0.07)',
      boxShadow: accent === true ? '0 4px 20px rgba(242, 166, 179, 0.08)' : 'none',
      transition: 'transform 0.15s ease, border-color 0.15s ease',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
    }}
  >
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 6,
      }}
    >
      <span style={{ fontSize: 11, fontWeight: 600, color: C.dim, letterSpacing: 0.3 }}>
        {caption}
      </span>
      {icon && (
        <div style={{ color: color ?? (accent ? C.accent : C.dim), opacity: 0.85 }}>{icon}</div>
      )}
    </div>
    <div
      style={{
        fontSize: 24,
        fontWeight: 700,
        letterSpacing: '-0.5px',
        color: color ?? (accent === true ? C.accent : C.text),
      }}
    >
      {value}
    </div>
  </div>
);

const shortDay = (at: number): string => {
  const d = new Date(at);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()}`;
};

function CalendarConnectionCard({
  onConnected,
}: {
  readonly onConnected?: () => void;
}): JSX.Element {
  const [status, setStatus] = useState<CalendarStatus | null>(null);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    void window.mochi.calendar.status().then(setStatus);
    return window.mochi.calendar.onChange(setStatus);
  }, []);

  const connect = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      let selfEmail: string | undefined;
      try {
        selfEmail = (await window.mochi.gmail.status()).email ?? undefined;
      } catch {
        selfEmail = undefined;
      }

      const result = await window.mochi.calendar.connect(url, selfEmail);
      if (result.ok) {
        setUrl('');
        setNote(`Connected! ${result.eventCount ?? 0} event(s) synced in the next three weeks.`);
        onConnected?.();
      } else {
        setError(result.error ?? 'That calendar could not be loaded.');
      }
    } finally {
      setBusy(false);
    }
  }, [url, onConnected]);

  const connected = status?.connected === true;

  return (
    <div
      style={{
        ...card,
        marginBottom: 16,
        borderRadius: 14,
        borderColor: 'rgba(242, 166, 179, 0.25)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
        }}
      >
        <strong style={{ fontSize: 14, color: C.text }}>Google Calendar Feed Link</strong>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: 0.4,
            textTransform: 'uppercase',
            color: connected ? C.good : C.faint,
            border: `1px solid ${connected ? 'rgba(168,230,184,0.35)' : C.border}`,
            borderRadius: 999,
            padding: '2px 10px',
          }}
        >
          {connected ? 'connected' : 'not connected'}
        </span>
      </div>

      {connected ? (
        <>
          <div style={{ fontSize: 12.5, color: C.dim, lineHeight: 1.6, marginBottom: 12 }}>
            <code
              style={{
                color: C.text,
                background: 'rgba(255, 255, 255, 0.05)',
                padding: '3px 8px',
                borderRadius: 6,
              }}
            >
              {status?.redacted}
            </code>
            <div style={{ marginTop: 6 }}>
              {status?.eventCount ?? 0} event(s) synced · checked{' '}
              {status?.lastSyncAt
                ? `${Math.round((Date.now() - status.lastSyncAt) / 60000)} min ago`
                : 'just now'}
              {status?.syncing === true && ' · checking…'}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              style={{ ...button('ghost'), fontSize: 12, padding: '6px 14px', borderRadius: 8 }}
              disabled={status?.syncing === true}
              onClick={() => void window.mochi.calendar.refresh()}
            >
              {status?.syncing === true ? 'Checking…' : 'Sync Now'}
            </button>
            <button
              style={{ ...button('ghost'), fontSize: 12, padding: '6px 14px', borderRadius: 8 }}
              onClick={() => void window.mochi.calendar.disconnect()}
            >
              Disconnect Feed
            </button>
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 12.5, color: C.dim, lineHeight: 1.6, marginBottom: 12 }}>
            In Google Calendar open <strong style={{ color: C.text }}>Settings</strong>, pick your
            calendar, scroll to{' '}
            <strong style={{ color: C.text }}>Secret address in iCal format</strong> and copy it.
          </div>

          <span style={label}>Secret iCal address</span>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input
              style={{
                ...input,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: 12.5,
              }}
              type="password"
              placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
              value={url}
              spellCheck={false}
              autoComplete="off"
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void connect();
              }}
            />
            <button
              style={{
                ...button('primary'),
                whiteSpace: 'nowrap',
                fontSize: 12.5,
                padding: '8px 16px',
                borderRadius: 9,
              }}
              disabled={busy || url.trim().length === 0}
              onClick={() => void connect()}
            >
              {busy ? 'Checking…' : 'Connect Calendar'}
            </button>
          </div>
        </>
      )}

      {error !== null && <p style={{ margin: '8px 0 0', fontSize: 12, color: C.warn }}>{error}</p>}
      {note !== null && <p style={{ margin: '8px 0 0', fontSize: 12, color: C.good }}>{note}</p>}
    </div>
  );
}

function AdvancedGoogleCard(): JSX.Element {
  const [status, setStatus] = useState<GoogleStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [wizard, setWizard] = useState(false);

  useEffect(() => {
    void window.mochi.google.status().then(setStatus);
    return window.mochi.google.onChange(setStatus);
  }, []);

  if (wizard) {
    return <GoogleWizard onDone={() => setWizard(false)} onCancel={() => setWizard(false)} />;
  }

  return (
    <div style={{ ...card, marginBottom: 16, borderRadius: 14 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          background: 'transparent',
          border: 'none',
          color: C.accent,
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span style={{ fontSize: 11 }}>{open ? '▾' : '▸'}</span>
        Advanced: your own Google Cloud project (OAuth API)
        {status?.connected === true && (
          <span style={{ color: C.good, fontWeight: 400 }}> · connected</span>
        )}
      </button>

      {open && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.6, marginBottom: 12 }}>
            Full API access rather than a read-only feed, allowing Mochi to create and change
            events. Requires setting up your own Google Cloud project.
          </div>

          {status?.connected === true ? (
            <button style={button('ghost')} onClick={() => void window.mochi.google.disconnect()}>
              Disconnect OAuth
            </button>
          ) : (
            <button style={button('ghost')} onClick={() => setWizard(true)}>
              Start the OAuth Wizard
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function CalendarTab(): JSX.Element {
  const [status, setStatus] = useState<CalendarStatus | null>(null);
  const [events, setEvents] = useState<readonly CalendarEvent[]>([]);
  const [sessions, setSessions] = useState<readonly WorkSession[]>([]);
  const [tasks, setTasks] = useState<readonly Task[]>([]);
  const [settings, setSettings] = useState<MochiSettings | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [hoveredBarIndex, setHoveredBarIndex] = useState<number | null>(null);
  const [showConnectionPanel, setShowConnectionPanel] = useState(false);

  const reload = useCallback(() => {
    void window.mochi.calendar.events().then(setEvents);
    void window.mochi.timer.listSessions().then(setSessions);
    void window.mochi.tasks.list().then(setTasks);
  }, []);

  useEffect(() => {
    void window.mochi.calendar.status().then(setStatus);
    void window.mochi.settings.get().then(setSettings);
    reload();

    const offCalendar = window.mochi.calendar.onChange((next) => {
      setStatus(next);
      reload();
    });
    const offSettings = window.mochi.settings.onChange(setSettings);
    const offTasks = window.mochi.tasks.onChange(setTasks);
    const tick = setInterval(() => setNow(new Date()), 60_000);

    return () => {
      offCalendar();
      offSettings();
      offTasks();
      clearInterval(tick);
    };
  }, [reload]);

  const workHours = settings?.workHours ?? { start: '09:00', end: '17:00' };
  const connected = status?.connected === true;

  const today = useMemo(() => {
    const window = workWindow(now, workHours);
    if (window === null) return null;
    return {
      window,
      shape: dayShape(events, window, { notBefore: now.getTime() }),
      blocks: freeBlocks(events, window, { notBefore: now.getTime() }),
      clashes: conflicts(eventsOnDay(events, now)),
      todayEvents: eventsOnDay(events, now),
    };
  }, [events, now, workHours]);

  const briefing = useMemo(
    () => composeBriefing({ events, tasks, workHours, now, hasCalendar: connected }),
    [events, tasks, workHours, now, connected],
  );

  const retro = useMemo(
    () =>
      summarise(buildDayRecords({ sessions, events, workHours, endingOn: now, days: RETRO_DAYS })),
    [sessions, events, workHours, now],
  );

  const impactText = describeImpact(retro.impact);
  const ahead = upcoming(events, now.getTime(), 7 * 24 * 60 * 60_000);

  const byDay = useMemo(() => {
    const groups = new Map<string, CalendarEvent[]>();
    for (const event of ahead) {
      const key = new Date(event.startsAt).toDateString();
      const list = groups.get(key);
      if (list === undefined) groups.set(key, [event]);
      else list.push(event);
    }
    return [...groups.entries()];
  }, [ahead]);

  const peak = Math.max(1, ...retro.records.map((r) => Math.max(r.trackedMs, r.meetingMs)));

  const nowPercent = useMemo(() => {
    if (!today) return null;
    const total = today.window.end - today.window.start;
    if (total <= 0) return null;
    const progress = (now.getTime() - today.window.start) / total;
    return Math.max(0, Math.min(100, progress * 100));
  }, [today, now]);

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', color: C.text }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 20,
        }}
      >
        <div>
          <h2 style={{ ...h2, fontSize: 22, fontWeight: 700, letterSpacing: '-0.3px' }}>
            Calendar & Schedule
          </h2>
          <p style={{ ...sub, marginBottom: 0 }}>
            What today looks like, and how the last {RETRO_DAYS} days actually went.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => setShowConnectionPanel((v) => !v)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 14px',
              borderRadius: 20,
              background: connected ? 'rgba(168, 230, 184, 0.12)' : 'rgba(242, 166, 179, 0.15)',
              border: `1px solid ${connected ? 'rgba(168, 230, 184, 0.28)' : 'rgba(242, 166, 179, 0.35)'}`,
              fontSize: 11.5,
              fontWeight: 600,
              color: connected ? C.good : C.accent,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: connected ? C.good : C.accent,
                boxShadow: connected ? `0 0 8px ${C.good}` : `0 0 8px ${C.accent}`,
              }}
            />
            {connected ? 'Calendar Connected' : 'Connect Calendar'}
            <span style={{ fontSize: 10, opacity: 0.7 }}>{showConnectionPanel ? '▲' : '▼'}</span>
          </button>
        </div>
      </div>

      {/* ---- CALENDAR CONNECTION CONTROL PANEL ---- */}
      {(showConnectionPanel || !connected) && (
        <div style={{ marginBottom: 20 }}>
          <CalendarConnectionCard onConnected={() => reload()} />
          <AdvancedGoogleCard />
        </div>
      )}

      {/* ---- TODAY BRIEFING HERO CARD ---- */}
      <div
        style={{
          ...card,
          marginBottom: 20,
          padding: '18px 22px',
          borderRadius: 16,
          borderColor: 'rgba(242, 166, 179, 0.3)',
          background:
            'linear-gradient(135deg, rgba(242, 166, 179, 0.11) 0%, rgba(36, 31, 43, 0.95) 50%, rgba(27, 23, 32, 0.98) 100%)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke={C.accent}
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
            </svg>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, color: C.accent }}>
              TODAY'S OVERVIEW
            </span>
          </div>
          <button
            style={{
              ...button('ghost'),
              fontSize: 12,
              fontWeight: 600,
              padding: '5px 14px',
              borderRadius: 8,
              background: 'rgba(242, 166, 179, 0.15)',
              borderColor: 'rgba(242, 166, 179, 0.3)',
              color: C.text,
              transition: 'all 0.15s ease',
            }}
            onClick={() => void window.mochi.calendar.previewBriefing()}
            title="Makes Mochi say the morning briefing now, so you can hear it before relying on it"
          >
            Preview the briefing
          </button>
        </div>

        <div
          style={{
            fontSize: 16,
            fontWeight: 600,
            color: C.text,
            lineHeight: 1.5,
            marginBottom: briefing.lines.length > 1 ? 10 : 0,
          }}
        >
          {briefing.headline}
        </div>

        {briefing.lines.length > 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 4 }}>
            {briefing.lines.slice(1).map((line) => (
              <div
                key={line.kind + line.text}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  fontSize: 13,
                  color: C.dim,
                  lineHeight: 1.5,
                }}
              >
                <span style={{ color: C.accent, marginTop: 1 }}>•</span>
                <span>{line.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/*
        ---- TODAY'S METRICS & TIMELINE ----

        Only when meetings actually break the day up. With an empty calendar this
        block was three noughts, an empty bar, and "Longest focus stretch 8h 00m"
        — which is the length of the workday, presented in green as though it were
        a finding. Nothing here is information until there is a meeting in it.
      */}
      {today !== null && today.shape.meetingCount > 0 && (
        <div style={{ marginBottom: 20 }}>
          {/* Stat Cards */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
            <Stat
              value={String(today.shape.meetingCount)}
              caption="Meetings left today"
              icon={
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
                  <line x1="16" x2="16" y1="2" y2="6" />
                  <line x1="8" x2="8" y1="2" y2="6" />
                  <line x1="3" x2="21" y1="10" y2="10" />
                </svg>
              }
            />
            <Stat
              value={humanDuration(today.shape.meetingMs)}
              caption="In meetings today"
              icon={
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              }
            />
            <Stat
              value={humanDuration(today.shape.longestFreeMs)}
              caption="Longest focus stretch"
              accent
              color={C.good}
              icon={
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={C.good}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
              }
            />
          </div>

          {/* Double Bookings Alert */}
          {today.clashes.length > 0 && (
            <div
              style={{
                ...card,
                marginBottom: 14,
                borderColor: 'rgba(255,179,193,0.4)',
                background:
                  'linear-gradient(135deg, rgba(255,179,193,0.12) 0%, rgba(36,31,43,0.9) 100%)',
                padding: '14px 18px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 13,
                  fontWeight: 650,
                  color: C.warn,
                  marginBottom: 8,
                }}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                  <line x1="12" x2="12" y1="9" y2="13" />
                  <line x1="12" x2="12.01" y1="17" y2="17" />
                </svg>
                {today.clashes.length === 1
                  ? 'Double-Booking Conflict'
                  : 'Double-Booking Conflicts'}
              </div>
              {today.clashes.slice(0, 3).map(([a, b]) => (
                <div key={a.id + b.id} style={{ fontSize: 12.5, color: C.text, lineHeight: 1.5 }}>
                  <strong style={{ color: C.warn }}>{a.title}</strong> overlaps with{' '}
                  <strong style={{ color: C.warn }}>{b.title}</strong> at {clockLabel(b.startsAt)}
                </div>
              ))}
            </div>
          )}

          {/* Visual Day Schedule & Timeline Bar */}
          <div style={{ ...card, padding: '16px 20px', borderRadius: 14 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 12,
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: C.dim,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                Today's Work Schedule ({clockLabel(today.window.start)} –{' '}
                {clockLabel(today.window.end)})
              </span>
              <span style={{ fontSize: 11.5, color: C.faint }}>
                {today.blocks.length} focus {today.blocks.length === 1 ? 'window' : 'windows'}{' '}
                remaining
              </span>
            </div>

            {/* Workday Progress Track */}
            <div
              style={{
                height: 28,
                width: '100%',
                background: 'rgba(255, 255, 255, 0.05)',
                borderRadius: 8,
                position: 'relative',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                marginBottom: 14,
                border: '1px solid rgba(255, 255, 255, 0.06)',
              }}
            >
              {/* Render free block windows */}
              {today.blocks.map((block) => {
                const total = today.window.end - today.window.start;
                const left = ((block.start - today.window.start) / total) * 100;
                const width = ((block.end - block.start) / total) * 100;
                return (
                  <div
                    key={block.start}
                    title={`Free Window: ${clockLabel(block.start)} - ${clockLabel(block.end)} (${humanDuration(block.end - block.start)})`}
                    style={{
                      position: 'absolute',
                      left: `${left}%`,
                      width: `${width}%`,
                      height: '100%',
                      background: 'rgba(168, 230, 184, 0.25)',
                      borderLeft: '1px solid rgba(168, 230, 184, 0.5)',
                      borderRight: '1px solid rgba(168, 230, 184, 0.5)',
                    }}
                  />
                );
              })}

              {/* Render meeting events on timeline */}
              {today.todayEvents.map((event) => {
                const total = today.window.end - today.window.start;
                const left = Math.max(0, ((event.startsAt - today.window.start) / total) * 100);
                const width = Math.min(100 - left, ((event.endsAt - event.startsAt) / total) * 100);
                return (
                  <div
                    key={event.id}
                    title={`Meeting: ${event.title} (${clockLabel(event.startsAt)} - ${clockLabel(event.endsAt)})`}
                    style={{
                      position: 'absolute',
                      left: `${left}%`,
                      width: `${Math.max(1, width)}%`,
                      height: '100%',
                      background: 'rgba(242, 166, 179, 0.65)',
                      borderRadius: 4,
                      zIndex: 2,
                    }}
                  />
                );
              })}

              {/* Current Time Indicator ("NOW") */}
              {nowPercent !== null && (
                <div
                  style={{
                    position: 'absolute',
                    left: `${nowPercent}%`,
                    top: 0,
                    bottom: 0,
                    width: 2,
                    background: C.accent,
                    boxShadow: `0 0 6px ${C.accent}`,
                    zIndex: 4,
                  }}
                  title={`Now (${clockLabel(now.getTime())})`}
                />
              )}
            </div>

            {/* Free Focus Block Chips */}
            {today.blocks.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {today.blocks.map((block) => (
                  <div
                    key={block.start}
                    style={{
                      fontSize: 12,
                      color: C.text,
                      background: 'rgba(168, 230, 184, 0.08)',
                      border: '1px solid rgba(168, 230, 184, 0.22)',
                      borderRadius: 8,
                      padding: '5px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <span
                      style={{ width: 6, height: 6, borderRadius: '50%', background: C.good }}
                    />
                    <span style={{ fontWeight: 500 }}>
                      {clockLabel(block.start)} – {clockLabel(block.end)}
                    </span>
                    <span style={{ color: C.good, fontSize: 11, fontWeight: 600 }}>
                      ({humanDuration(block.end - block.start)})
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12.5, color: C.dim }}>
                No remaining free blocks for today.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---- NEXT 7 DAYS AGENDA ---- */}
      <div style={{ ...card, marginBottom: 20, padding: '18px 20px', borderRadius: 16 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 14,
            paddingBottom: 10,
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke={C.accent}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
              <line x1="16" x2="16" y1="2" y2="6" />
              <line x1="8" x2="8" y1="2" y2="6" />
              <line x1="3" x2="21" y1="10" y2="10" />
            </svg>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
              Upcoming Schedule (Next 7 Days)
            </span>
          </div>
          {connected && (
            <button
              style={{
                ...button('ghost'),
                fontSize: 11.5,
                padding: '4px 12px',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
              disabled={status?.syncing === true}
              onClick={() => void window.mochi.calendar.refresh()}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
              </svg>
              {status?.syncing === true ? 'Refreshing…' : 'Sync Now'}
            </button>
          )}
        </div>

        {byDay.length === 0 ? (
          /*
            One line, not a bordered card with an emoji. The headline above
            already says the day is clear; this said the same thing a second time
            in a bigger box.
          */
          <div style={{ fontSize: 12.5, color: C.faint, padding: '4px 2px 2px' }}>
            Nothing booked in the next seven days. Mochi will speak up five minutes before anything
            that appears.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {byDay.map(([key, list]) => (
              <div key={key}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: C.accent,
                    letterSpacing: 0.6,
                    marginBottom: 8,
                    textTransform: 'uppercase',
                  }}
                >
                  {shortDay(list[0]!.startsAt)}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {list.map((event) => (
                    <div
                      key={event.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        borderRadius: 10,
                        background: 'rgba(36, 31, 43, 0.6)',
                        border: '1px solid rgba(255, 255, 255, 0.05)',
                        transition: 'background 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: C.dim,
                            padding: '3px 8px',
                            borderRadius: 6,
                            background: 'rgba(255, 255, 255, 0.06)',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {clockLabel(event.startsAt)}
                        </span>
                        <div>
                          <div style={{ fontSize: 13.5, fontWeight: 600, color: C.text }}>
                            {event.title}
                          </div>
                          {event.organizer && (
                            <div style={{ fontSize: 11.5, color: C.faint, marginTop: 2 }}>
                              Organized by {event.organizer}
                            </div>
                          )}
                        </div>
                      </div>

                      {event.conferenceUrl !== undefined && (
                        <a
                          href={event.conferenceUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            fontSize: 11.5,
                            fontWeight: 650,
                            color: '#241f2b',
                            background: C.accent,
                            padding: '5px 13px',
                            borderRadius: 7,
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            boxShadow: '0 2px 8px rgba(242, 166, 179, 0.3)',
                          }}
                        >
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polygon points="23 7 16 12 23 17 23 7" />
                            <rect width="15" height="14" x="1" y="5" rx="2" ry="2" />
                          </svg>
                          Join Call
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/*
        ---- LAST 30 DAYS ----

        Kept, but hidden until there is something to compare. Thirty empty columns
        read as a broken chart rather than as a new install, and this was the
        largest block on the page.
      */}
      {retro.activeDays > 0 && (
        <div style={{ ...card, marginBottom: 20, padding: '20px 22px', borderRadius: 16 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 14,
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Last 30 days</div>
              <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>
                Comparing tracked focus work against meeting hours over the last {RETRO_DAYS} days (
                {retro.activeDays} active days).
              </div>
            </div>
            <div style={{ display: 'flex', gap: 14, fontSize: 11.5, fontWeight: 500 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: C.accent }} />
                Tracked
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: 'rgba(255, 179, 193, 0.55)',
                  }}
                />
                Meetings
              </span>
            </div>
          </div>

          {/* 3 Retro Headline Summary Cards */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
            <Stat value={humanDuration(retro.totalTrackedMs)} caption="Total Tracked Work" accent />
            <Stat value={humanDuration(retro.totalMeetingMs)} caption="Total Meeting Time" />
            <Stat
              value={humanDuration(retro.avgTrackedMs)}
              caption="Avg per Active Day"
              color={C.good}
            />
          </div>

          {/* Interactive Bar Chart Container */}
          <div
            style={{
              position: 'relative',
              background: 'rgba(0, 0, 0, 0.15)',
              padding: '16px 14px',
              borderRadius: 12,
              border: '1px solid rgba(255, 255, 255, 0.04)',
            }}
          >
            {/* Tooltip Overlay */}
            {hoveredBarIndex !== null && retro.records[hoveredBarIndex] && (
              <div
                style={{
                  position: 'absolute',
                  top: 10,
                  right: 14,
                  background: 'rgba(36, 31, 43, 0.95)',
                  border: '1px solid rgba(242, 166, 179, 0.3)',
                  borderRadius: 8,
                  padding: '6px 12px',
                  fontSize: 11.5,
                  color: C.text,
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
                  zIndex: 10,
                  pointerEvents: 'none',
                }}
              >
                <strong style={{ color: C.accent }}>
                  {shortDay(retro.records[hoveredBarIndex]!.at)}
                </strong>{' '}
                · {humanDuration(retro.records[hoveredBarIndex]!.trackedMs)} tracked ·{' '}
                {humanDuration(retro.records[hoveredBarIndex]!.meetingMs)} in meetings
              </div>
            )}

            {/* Bar Chart Visualization */}
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-end',
                gap: 4,
                height: 110,
                paddingBottom: 4,
              }}
            >
              {retro.records.map((r, idx) => (
                <div
                  key={r.day}
                  onMouseEnter={() => setHoveredBarIndex(idx)}
                  onMouseLeave={() => setHoveredBarIndex(null)}
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                    height: '100%',
                    justifyContent: 'flex-end',
                    cursor: 'pointer',
                    opacity: hoveredBarIndex === null || hoveredBarIndex === idx ? 1 : 0.45,
                    transition: 'opacity 0.15s ease',
                  }}
                >
                  {/* Meeting Bar (top) */}
                  <div
                    style={{
                      height: Math.round((r.meetingMs / peak) * 50),
                      background: 'rgba(255, 179, 193, 0.55)',
                      borderRadius: '4px 4px 0 0',
                      transition: 'height 0.2s ease',
                    }}
                  />
                  {/* Tracked Bar (bottom) */}
                  <div
                    style={{
                      height: Math.max(r.trackedMs > 0 ? 4 : 0, (r.trackedMs / peak) * 54),
                      background: C.accent,
                      borderRadius: '0 0 4px 4px',
                      transition: 'height 0.2s ease',
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ---- PATTERN & HIGHLIGHT INSIGHTS ---- */}
      {impactText !== null && (
        <div
          style={{
            ...card,
            marginBottom: 16,
            padding: '16px 20px',
            borderRadius: 14,
            borderColor: 'rgba(168, 230, 184, 0.3)',
            background:
              'linear-gradient(135deg, rgba(168, 230, 184, 0.08) 0%, rgba(36, 31, 43, 0.95) 100%)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              fontWeight: 700,
              color: C.good,
              letterSpacing: 0.8,
              marginBottom: 6,
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
              <path d="M9 18h6" />
              <path d="M10 22h4" />
            </svg>
            OBSERVED WORK PATTERN
          </div>
          <div style={{ fontSize: 13.5, fontWeight: 500, color: C.text, lineHeight: 1.6 }}>
            {impactText}
          </div>
          <div style={{ fontSize: 11.5, color: C.faint, marginTop: 6 }}>
            Derived directly from your activity logs over the past 30 days.
          </div>
        </div>
      )}

      {retro.bestDay !== null && (
        <div
          style={{
            ...card,
            padding: '16px 20px',
            borderRadius: 14,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 16,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11.5,
                fontWeight: 600,
                color: C.dim,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              Most Tracked Day
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.accent, marginTop: 4 }}>
              {shortDay(retro.bestDay.at)} · {humanDuration(retro.bestDay.trackedMs)}
            </div>
          </div>
          {retro.busiestDay !== null && (
            <div>
              <div
                style={{
                  fontSize: 11.5,
                  fontWeight: 600,
                  color: C.dim,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                Heaviest Meeting Day
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginTop: 4 }}>
                {shortDay(retro.busiestDay.at)} · {retro.busiestDay.meetingCount} meetings (
                {humanDuration(retro.busiestDay.meetingMs)})
              </div>
            </div>
          )}
          {retro.fragmentedDays > 0 && (
            <div>
              <div
                style={{
                  fontSize: 11.5,
                  fontWeight: 600,
                  color: C.dim,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                Fragmented Days
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginTop: 4 }}>
                {retro.fragmentedDays} of {retro.activeDays} active days had no clear focus stretch
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
