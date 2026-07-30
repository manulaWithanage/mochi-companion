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
  type MochiSettings,
  type Task,
  type WorkSession,
} from '@mochi/core';
import { button, C, card, h2, humanDuration, sub, WEEKDAYS } from '../ui.js';

/**
 * Calendar: the day ahead and the month behind, in one place.
 *
 * The retrospective is why this is a tab rather than another card. Meetings
 * alone say what was booked and the timer alone says what was done; only the
 * two together answer whether one explains the other, and that comparison
 * needs room a card does not have.
 *
 * Everything here is arithmetic over the user's own data. Nothing is inferred
 * by a model, and the wording stays observational — the numbers can show that
 * heavy-meeting days coincide with less tracked work, which is not the same as
 * proving meetings caused it.
 */

const RETRO_DAYS = 30;

const Stat = ({
  value,
  caption,
  accent,
}: {
  readonly value: string;
  readonly caption: string;
  readonly accent?: boolean;
}): JSX.Element => (
  <div style={{ ...card, flex: 1, padding: '13px 15px' }}>
    <div style={{ fontSize: 22, fontWeight: 650, color: accent === true ? C.accent : C.text }}>
      {value}
    </div>
    <div style={{ fontSize: 11.5, color: C.dim, marginTop: 2 }}>{caption}</div>
  </div>
);

const shortDay = (at: number): string => {
  const d = new Date(at);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()}`;
};

export function CalendarTab(): JSX.Element {
  const [status, setStatus] = useState<CalendarStatus | null>(null);
  const [events, setEvents] = useState<readonly CalendarEvent[]>([]);
  const [sessions, setSessions] = useState<readonly WorkSession[]>([]);
  const [tasks, setTasks] = useState<readonly Task[]>([]);
  const [settings, setSettings] = useState<MochiSettings | null>(null);
  const [now, setNow] = useState(() => new Date());

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
    // Relative times drift if nothing re-renders.
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
    };
  }, [events, now, workHours]);

  const briefing = useMemo(
    () => composeBriefing({ events, tasks, workHours, now, hasCalendar: connected }),
    [events, tasks, workHours, now, connected],
  );

  const retro = useMemo(
    () =>
      summarise(
        buildDayRecords({ sessions, events, workHours, endingOn: now, days: RETRO_DAYS }),
      ),
    [sessions, events, workHours, now],
  );

  const impactText = describeImpact(retro.impact);
  const ahead = upcoming(events, now.getTime(), 7 * 24 * 60 * 60_000);

  // Group the agenda by day so a week reads as a week.
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

  const peak = Math.max(
    1,
    ...retro.records.map((r) => Math.max(r.trackedMs, r.meetingMs)),
  );

  return (
    <div>
      <h2 style={h2}>Calendar</h2>
      <p style={sub}>What today looks like, and how the last {RETRO_DAYS} days actually went.</p>

      {/* ---- briefing ---- */}
      <div
        style={{
          ...card,
          marginBottom: 14,
          borderColor: 'rgba(242,166,179,0.28)',
          background: 'rgba(242,166,179,0.06)',
        }}
      >
        <div style={{ fontSize: 11, letterSpacing: 0.5, color: C.accent, marginBottom: 6 }}>
          TODAY
        </div>
        <div style={{ fontSize: 15, color: C.text, lineHeight: 1.5, marginBottom: 8 }}>
          {briefing.headline}
        </div>
        {briefing.lines.length > 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {briefing.lines.slice(1).map((line) => (
              <div key={line.kind + line.text} style={{ fontSize: 12.5, color: C.dim }}>
                {line.text}
              </div>
            ))}
          </div>
        )}
      </div>

      {!connected && (
        <div style={{ ...card, marginBottom: 14, borderStyle: 'dashed', background: 'transparent' }}>
          <div style={{ fontSize: 13, marginBottom: 4 }}>No calendar connected</div>
          <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.55 }}>
            Meetings and the meeting side of the retrospective stay empty until you add a feed in
            Connections. Tracked time below is real either way.
          </div>
        </div>
      )}

      {/* ---- today's shape ---- */}
      {connected && today !== null && (
        <>
          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            <Stat value={String(today.shape.meetingCount)} caption="meetings left today" />
            <Stat value={humanDuration(today.shape.meetingMs)} caption="in meetings" />
            <Stat
              value={humanDuration(today.shape.longestFreeMs)}
              caption="longest clear stretch"
              accent
            />
          </div>

          {today.clashes.length > 0 && (
            <div
              style={{
                ...card,
                marginBottom: 14,
                borderColor: 'rgba(255,179,193,0.3)',
                background: 'rgba(255,179,193,0.07)',
              }}
            >
              <div style={{ fontSize: 12, color: C.warn, marginBottom: 6 }}>
                {today.clashes.length === 1 ? 'A double-booking' : 'Double-bookings'}
              </div>
              {today.clashes.slice(0, 3).map(([a, b]) => (
                <div key={a.id + b.id} style={{ fontSize: 12.5, color: C.text, lineHeight: 1.6 }}>
                  {a.title} overlaps {b.title} at {clockLabel(b.startsAt)}
                </div>
              ))}
            </div>
          )}

          {today.blocks.length > 0 && (
            <div style={{ ...card, marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: C.dim, marginBottom: 8 }}>
                Free blocks left today
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {today.blocks.map((block) => (
                  <span
                    key={block.start}
                    style={{
                      fontSize: 12,
                      color: C.text,
                      border: `1px solid ${C.border}`,
                      borderRadius: 999,
                      padding: '4px 11px',
                    }}
                  >
                    {clockLabel(block.start)}–{clockLabel(block.end)}
                    <span style={{ color: C.faint }}>
                      {'  '}
                      {humanDuration(block.end - block.start)}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ---- agenda ---- */}
      {connected && (
        <div style={{ ...card, marginBottom: 14 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 10,
            }}
          >
            <div style={{ fontSize: 12, color: C.dim }}>Next 7 days</div>
            <button
              style={{ ...button('ghost'), fontSize: 11.5, padding: '4px 10px' }}
              disabled={status?.syncing === true}
              onClick={() => void window.mochi.calendar.refresh()}
            >
              {status?.syncing === true ? 'Checking…' : 'Check now'}
            </button>
          </div>

          {byDay.length === 0 ? (
            <div style={{ fontSize: 12.5, color: C.dim }}>Nothing scheduled this week.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {byDay.map(([key, list]) => (
                <div key={key}>
                  <div style={{ fontSize: 11, color: C.faint, letterSpacing: 0.4, marginBottom: 5 }}>
                    {shortDay(list[0]!.startsAt).toUpperCase()}
                  </div>
                  {list.map((event) => (
                    <div
                      key={event.id}
                      style={{ display: 'flex', alignItems: 'baseline', gap: 9, padding: '2px 0' }}
                    >
                      <span
                        style={{
                          fontSize: 11.5,
                          color: C.faint,
                          minWidth: 56,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {clockLabel(event.startsAt)}
                      </span>
                      <span style={{ fontSize: 12.5, color: C.text, flex: 1, lineHeight: 1.45 }}>
                        {event.title}
                      </span>
                      {event.conferenceUrl !== undefined && (
                        <span style={{ fontSize: 10.5, color: C.accent, letterSpacing: 0.3 }}>
                          JOIN
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ---- retrospective ---- */}
      <div style={{ ...card, marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: C.dim, marginBottom: 12 }}>
          Last {RETRO_DAYS} days · {retro.activeDays} active
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <Stat value={humanDuration(retro.totalTrackedMs)} caption="tracked" accent />
          <Stat value={humanDuration(retro.totalMeetingMs)} caption="in meetings" />
          <Stat value={humanDuration(retro.avgTrackedMs)} caption="tracked per active day" />
        </div>

        {/* tracked vs meetings, per day */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 86 }}>
          {retro.records.map((r) => (
            <div
              key={r.day}
              title={`${shortDay(r.at)} · ${humanDuration(r.trackedMs)} tracked · ${humanDuration(r.meetingMs)} in meetings`}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}
            >
              <div
                style={{
                  height: Math.round((r.meetingMs / peak) * 34),
                  background: 'rgba(255,179,193,0.55)',
                  borderRadius: '3px 3px 0 0',
                }}
              />
              <div
                style={{
                  height: Math.max(r.trackedMs > 0 ? 3 : 0, (r.trackedMs / peak) * 44),
                  background: C.accent,
                  borderRadius: '0 0 3px 3px',
                }}
              />
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 11, color: C.faint }}>
          <span>
            <span style={{ color: C.accent }}>█</span> tracked
          </span>
          <span>
            <span style={{ color: 'rgba(255,179,193,0.8)' }}>█</span> meetings
          </span>
        </div>
      </div>

      {/* ---- the finding ---- */}
      {impactText !== null && (
        <div style={{ ...card, marginBottom: 14 }}>
          <div style={{ fontSize: 11, letterSpacing: 0.5, color: C.accent, marginBottom: 6 }}>
            PATTERN
          </div>
          <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6 }}>{impactText}</div>
          <div style={{ fontSize: 11.5, color: C.faint, marginTop: 8, lineHeight: 1.5 }}>
            An observation from your own data, not a claim about cause.
          </div>
        </div>
      )}

      {retro.bestDay !== null && (
        <div style={{ ...card, display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11.5, color: C.dim }}>Most tracked</div>
            <div style={{ fontSize: 13, color: C.text, marginTop: 3 }}>
              {shortDay(retro.bestDay.at)} · {humanDuration(retro.bestDay.trackedMs)}
            </div>
          </div>
          {retro.busiestDay !== null && (
            <div>
              <div style={{ fontSize: 11.5, color: C.dim }}>Most meetings</div>
              <div style={{ fontSize: 13, color: C.text, marginTop: 3 }}>
                {shortDay(retro.busiestDay.at)} · {retro.busiestDay.meetingCount} ·{' '}
                {humanDuration(retro.busiestDay.meetingMs)}
              </div>
            </div>
          )}
          {retro.fragmentedDays > 0 && (
            <div>
              <div style={{ fontSize: 11.5, color: C.dim }}>Days with no clear stretch</div>
              <div style={{ fontSize: 13, color: C.text, marginTop: 3 }}>
                {retro.fragmentedDays} of {retro.activeDays}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
