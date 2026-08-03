import { useCallback, useEffect, useMemo, useState, type JSX } from 'react';
import {
  activityCategoryInfo,
  focusedMs,
  longestStretchMs,
  spansWithin,
  switchCount,
  totalsByApp,
  totalsByCategory,
  ACTIVITY_CATEGORIES,
  KNOWN_SITES,
  type ActivityCategory,
  type ActivitySpan,
  type MochiSettings,
} from '@mochi/core';
import { button, C, card, h2, humanDuration, sub, WEEKDAYS } from '../ui.js';

const CATEGORY_COLOUR: Record<ActivityCategory, string> = {
  coding: '#f2a6b3',
  design: '#c9a6f2',
  writing: '#a6c8f2',
  terminal: '#a8e6b8',
  meeting: '#ffb3c1',
  communication: '#f2d3a6',
  browsing: '#8f8aa3',
  gaming: '#7fd8c8',
  media: '#f5a3e0',
  other: '#5a5364',
};

type Range = 'today' | 'week';

/** Sleek hover tooltip component for contextual UX help */
const Tooltip = ({
  content,
  children,
  width = 280,
}: {
  readonly content: React.ReactNode;
  readonly children: React.ReactNode;
  readonly width?: number;
}): JSX.Element => {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {children}
      {hovered && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: '50%',
            transform: 'translateX(-50%) translateY(-6px)',
            width,
            maxWidth: '90vw',
            padding: '10px 14px',
            borderRadius: 10,
            background: '#282230',
            border: '1px solid #3d3448',
            boxShadow: '0 10px 28px rgba(0, 0, 0, 0.55)',
            color: C.text,
            fontSize: 12,
            lineHeight: 1.55,
            zIndex: 999,
            pointerEvents: 'none',
          }}
        >
          {content}
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              borderWidth: 6,
              borderStyle: 'solid',
              borderColor: '#3d3448 transparent transparent transparent',
            }}
          />
        </div>
      )}
    </div>
  );
};

const Stat = ({
  value,
  caption,
  accent,
  tooltip,
}: {
  readonly value: string;
  readonly caption: string;
  readonly accent?: boolean;
  readonly tooltip?: string;
}): JSX.Element => (
  <div style={{ ...card, flex: 1, padding: '13px 15px', position: 'relative' }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ fontSize: 22, fontWeight: 650, color: accent === true ? C.accent : C.text }}>
        {value}
      </div>
      {tooltip !== undefined && (
        <Tooltip content={tooltip} width={220}>
          <span
            style={{
              fontSize: 12,
              color: C.dim,
              cursor: 'help',
              opacity: 0.6,
              transition: 'opacity 0.15s',
            }}
          >
            ⓘ
          </span>
        </Tooltip>
      )}
    </div>
    <div style={{ fontSize: 11.5, color: C.dim, marginTop: 2 }}>{caption}</div>
  </div>
);

/**
 * Visual activity timeline strip
 */
const Timeline = ({
  spans,
  from,
  to,
}: {
  readonly spans: readonly ActivitySpan[];
  readonly from: number;
  readonly to: number;
}): JSX.Element | null => {
  const width = to - from;
  if (width <= 0 || spans.length === 0) return null;

  const firstAt = Math.min(...spans.map((s) => s.startedAt));
  const start = Math.max(from, firstAt - 15 * 60_000);
  const span = Math.max(1, to - start);

  const hours: number[] = [];
  const cursor = new Date(start);
  cursor.setMinutes(0, 0, 0);
  cursor.setHours(cursor.getHours() + 1);
  while (cursor.getTime() < to) {
    hours.push(cursor.getTime());
    cursor.setHours(cursor.getHours() + 1);
  }

  return (
    <div style={{ ...card, marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 12, color: C.dim, fontWeight: 600 }}>Hourly Activity Timeline</div>
        <Tooltip content="Shows when you were actively using apps throughout today. Idle keyboard periods are automatically discarded." width={260}>
          <span style={{ fontSize: 11.5, color: C.faint, cursor: 'help' }}>How to read ⓘ</span>
        </Tooltip>
      </div>

      <div
        style={{
          position: 'relative',
          height: 28,
          borderRadius: 8,
          background: 'rgba(255, 255, 255, 0.035)',
          overflow: 'hidden',
          border: `1px solid ${C.border}`,
        }}
      >
        {spans.map((s) => (
          <div
            key={`${s.startedAt}-${s.app}`}
            title={`${s.app} · ${humanDuration(s.endedAt - s.startedAt)}`}
            style={{
              position: 'absolute',
              left: `${((s.startedAt - start) / span) * 100}%`,
              width: `${Math.max(0.4, ((s.endedAt - s.startedAt) / span) * 100)}%`,
              top: 0,
              bottom: 0,
              background: CATEGORY_COLOUR[s.category],
              opacity: 0.88,
              transition: 'opacity 0.15s',
            }}
          />
        ))}
      </div>

      <div style={{ position: 'relative', height: 14, marginTop: 6 }}>
        {hours.map((h) => (
          <span
            key={h}
            style={{
              position: 'absolute',
              left: `${((h - start) / span) * 100}%`,
              transform: 'translateX(-50%)',
              fontSize: 10,
              color: C.faint,
              whiteSpace: 'nowrap',
            }}
          >
            {new Date(h).getHours()}:00
          </span>
        ))}
      </div>
    </div>
  );
};

function rangeBounds(range: Range, now: Date): { from: number; to: number } {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (range === 'week') start.setDate(start.getDate() - 6);
  return { from: start.getTime(), to: now.getTime() };
}

export function ActivityTab(): JSX.Element {
  const [settings, setSettings] = useState<MochiSettings | null>(null);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [spans, setSpans] = useState<readonly ActivitySpan[]>([]);
  const [range, setRange] = useState<Range>('today');
  const [now, setNow] = useState(() => new Date());
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [showPrivacyDetails, setShowPrivacyDetails] = useState(false);

  const reload = useCallback((which: Range, at: Date) => {
    const { from, to } = rangeBounds(which, at);
    void window.mochi.activity
      .list(from, to)
      .then((rows) => setSpans(spansWithin(rows, from, to)))
      .catch(() => setSpans([]));
  }, []);

  useEffect(() => {
    void window.mochi.settings.get().then(setSettings);
    void window.mochi.activity.supported().then(setSupported);
    reload(range, new Date());

    const offSettings = window.mochi.settings.onChange(setSettings);
    const tick = setInterval(() => {
      const next = new Date();
      setNow(next);
      reload(range, next);
    }, 60_000);

    return () => {
      offSettings();
      clearInterval(tick);
    };
  }, [range, reload]);

  const bounds = useMemo(() => rangeBounds(range, now), [range, now]);
  const tracking = settings?.activityTracking === true;
  const sites = settings?.trackBrowsingSites === true;

  const apps = useMemo(() => totalsByApp(spans), [spans]);
  const categories = useMemo(
    () => totalsByCategory(spans).filter((c) => c.ms > 0),
    [spans],
  );
  const totalMs = useMemo(() => apps.reduce((sum, a) => sum + a.ms, 0), [apps]);
  const focused = useMemo(() => focusedMs(spans), [spans]);
  const switches = useMemo(() => switchCount(spans), [spans]);
  const longest = useMemo(() => longestStretchMs(spans), [spans]);

  const toggle = useCallback(async (next: boolean) => {
    setSettings(await window.mochi.settings.setActivityTracking(next));
  }, []);

  const toggleSites = useCallback(async (next: boolean) => {
    setSettings(await window.mochi.settings.setTrackBrowsingSites(next));
  }, []);

  const recategorise = useCallback(
    async (app: string, category: ActivityCategory) => {
      setSettings(await window.mochi.settings.setAppCategory(app, category));
      reload(range, new Date());
    },
    [range, reload],
  );

  const wipe = useCallback(async () => {
    await window.mochi.activity.forgetAll();
    setConfirmWipe(false);
    setSpans([]);
  }, []);

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      {/* Header & Range Switcher */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <h2 style={h2}>Activity Dashboard</h2>
          <p style={{ ...sub, margin: 0 }}>Visual time & application usage measured locally on this machine.</p>
        </div>

        {/* Range Buttons */}
        <div style={{ display: 'flex', gap: 6, background: C.panel, padding: 3, borderRadius: 10, border: `1px solid ${C.border}` }}>
          {(['today', 'week'] as const).map((r) => (
            <button
              key={r}
              style={{
                ...button(range === r ? 'primary' : 'ghost'),
                fontSize: 12,
                padding: '5px 13px',
                borderRadius: 8,
              }}
              onClick={() => {
                setRange(r);
                reload(r, new Date());
              }}
            >
              {r === 'today' ? 'Today' : 'Last 7 Days'}
            </button>
          ))}
        </div>
      </div>

      {/* Streamlined Privacy & Tracking Control Bar */}
      <div
        style={{
          ...card,
          marginBottom: 16,
          padding: '12px 16px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justify: 'space-between',
          gap: 12,
          background: 'rgba(34, 29, 41, 0.85)',
          borderColor: tracking ? 'rgba(168, 230, 184, 0.3)' : C.border,
        }}
      >
        {/* Status Indicators with Tooltips */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          {/* Privacy Tooltip Pill */}
          <Tooltip
            content={
              <div>
                <strong style={{ color: C.good, display: 'block', marginBottom: 4 }}>🔒 Local Privacy Guarantee</strong>
                Only application names in front are recorded. Idle time is discarded. Data stays inside Mochi&apos;s local database, never leaves this PC, and auto-deletes after 90 days.
              </div>
            }
            width={300}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                color: C.good,
                background: 'rgba(168, 230, 184, 0.1)',
                border: '1px solid rgba(168, 230, 184, 0.25)',
                padding: '4px 10px',
                borderRadius: 20,
                cursor: 'help',
                fontWeight: 500,
              }}
            >
              🔒 100% Private & Local <span style={{ fontSize: 11, opacity: 0.7 }}>ⓘ</span>
            </span>
          </Tooltip>

          {/* Tracking Status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: tracking ? C.good : C.warn,
                boxShadow: tracking ? '0 0 8px rgba(168, 230, 184, 0.5)' : 'none',
              }}
            />
            <span style={{ fontSize: 13, fontWeight: 550, color: C.text }}>
              {tracking ? 'Tracking Active' : 'Tracking Off'}
            </span>
            <Tooltip
              content={
                supported === false
                  ? 'Activity tracking is currently Windows-only.'
                  : tracking
                    ? 'Samples active application every 10 seconds while keyboard/mouse is in use.'
                    : 'Recording paused. Turn on to track work patterns.'
              }
              width={240}
            >
              <span style={{ fontSize: 11.5, color: C.faint, cursor: 'help' }}>ⓘ</span>
            </Tooltip>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Site Splitting Toggle with Tooltip */}
          {tracking && (
            <Tooltip
              content={
                <div>
                  <strong style={{ color: C.accent, display: 'block', marginBottom: 4 }}>🌐 Site Splitting</strong>
                  Distinguishes YouTube from research docs. Window titles are checked instantly against {KNOWN_SITES.length} popular sites and immediately discarded.
                  <div style={{ marginTop: 6, fontSize: 11, opacity: 0.7 }}>
                    <strong>Supported:</strong> {KNOWN_SITES.slice(0, 10).join(', ')}, and more.
                  </div>
                </div>
              }
              width={280}
            >
              <button
                style={{
                  ...button(sites ? 'primary' : 'ghost'),
                  fontSize: 12,
                  padding: '5px 12px',
                  borderRadius: 8,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
                onClick={() => void toggleSites(!sites)}
              >
                🌐 Sites: {sites ? 'On' : 'Off'} <span style={{ fontSize: 10, opacity: 0.7 }}>ⓘ</span>
              </button>
            </Tooltip>
          )}

          {/* Master Tracking Button */}
          <button
            style={{
              ...button(tracking ? 'ghost' : 'primary'),
              fontSize: 12,
              padding: '6px 14px',
              borderRadius: 8,
            }}
            disabled={supported === false}
            onClick={() => void toggle(!tracking)}
          >
            {tracking ? 'Pause Tracking' : 'Start Tracking'}
          </button>
        </div>
      </div>

      {/* Main Activity View */}
      {tracking ? (
        <>
          {totalMs === 0 ? (
            <div
              style={{
                ...card,
                borderStyle: 'dashed',
                background: 'transparent',
                textAlign: 'center',
                padding: '36px 24px',
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 4 }}>No Activity Spans Recorded Yet</div>
              <div style={{ fontSize: 12.5, color: C.dim, lineHeight: 1.55, maxWidth: 460, margin: '0 auto' }}>
                Activity samples arrive every couple of minutes while you use your computer. Keep working and check back shortly!
              </div>
            </div>
          ) : (
            <>
              {/* Timeline Chart */}
              {range === 'today' && <Timeline spans={spans} from={bounds.from} to={bounds.to} />}

              {/* Core Key Stats with Tooltips */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                <Stat
                  value={humanDuration(totalMs)}
                  caption="at the keyboard"
                  accent
                  tooltip="Total active time registered at keyboard or mouse."
                />
                <Stat
                  value={humanDuration(focused)}
                  caption="in focused apps"
                  tooltip="Time spent inside apps classified as work or productivity."
                />
                <Stat
                  value={humanDuration(longest)}
                  caption="longest stretch"
                  tooltip="Your single longest continuous block of uninterrupted focus."
                />
                <Stat
                  value={String(switches)}
                  caption="app switches"
                  tooltip="Total number of times you switched between active applications."
                />
              </div>

              {/* Work Category Breakdown */}
              <div style={{ ...card, marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ fontSize: 12, color: C.dim, fontWeight: 600 }}>Work Category Breakdown</div>
                  <Tooltip content="Work categories are inferred automatically based on application names. You can adjust categories in the list below." width={260}>
                    <span style={{ fontSize: 11.5, color: C.faint, cursor: 'help' }}>ⓘ</span>
                  </Tooltip>
                </div>

                <div
                  style={{
                    display: 'flex',
                    height: 12,
                    borderRadius: 6,
                    overflow: 'hidden',
                    background: 'rgba(255, 255, 255, 0.04)',
                    marginBottom: 12,
                  }}
                >
                  {categories.map((c) => (
                    <div
                      key={c.category}
                      title={`${c.label}: ${humanDuration(c.ms)}`}
                      style={{
                        width: `${c.share * 100}%`,
                        background: CATEGORY_COLOUR[c.category],
                        transition: 'width 240ms ease',
                      }}
                    />
                  ))}
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
                  {categories.map((c) => (
                    <span
                      key={c.category}
                      style={{ fontSize: 11.5, color: C.dim, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 3,
                          background: CATEGORY_COLOUR[c.category],
                        }}
                      />
                      {c.label} <strong style={{ color: C.text, fontWeight: 600 }}>{humanDuration(c.ms)}</strong>
                    </span>
                  ))}
                </div>
              </div>

              {/* Applications List */}
              <div style={{ ...card, marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: C.dim, fontWeight: 600 }}>Top Applications</div>
                  <Tooltip content="Change an application's category dropdown if Mochi categorized it incorrectly. Your preference is saved locally." width={260}>
                    <span style={{ fontSize: 11.5, color: C.faint, cursor: 'help' }}>Categorization ⓘ</span>
                  </Tooltip>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {apps.slice(0, 12).map((a) => (
                    <div key={a.app} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span
                        style={{
                          fontSize: 12.5,
                          color: C.text,
                          minWidth: 130,
                          maxWidth: 160,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          fontWeight: 500,
                        }}
                        title={a.app}
                      >
                        {a.app}
                      </span>
                      <div
                        style={{
                          flex: 1,
                          height: 7,
                          borderRadius: 4,
                          background: 'rgba(255, 255, 255, 0.04)',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            width: `${Math.max(2, a.share * 100)}%`,
                            height: '100%',
                            borderRadius: 4,
                            background: CATEGORY_COLOUR[a.category],
                          }}
                        />
                      </div>
                      <span
                        style={{
                          fontSize: 11.5,
                          color: C.text,
                          minWidth: 56,
                          textAlign: 'right',
                          fontVariantNumeric: 'tabular-nums',
                          fontWeight: 550,
                        }}
                      >
                        {humanDuration(a.ms)}
                      </span>

                      <select
                        value={a.category}
                        onChange={(e) =>
                          void recategorise(a.app, e.target.value as ActivityCategory)
                        }
                        title={`Categorized as ${activityCategoryInfo(a.category).label}. Click to change.`}
                        style={{
                          background: 'rgba(255, 255, 255, 0.03)',
                          border: `1px solid ${C.border}`,
                          borderRadius: 6,
                          color: C.dim,
                          fontSize: 11,
                          padding: '2px 6px',
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        {ACTIVITY_CATEGORIES.map((c) => (
                          <option key={c.id} value={c.id} style={{ background: '#241f2b', color: C.text }}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </>
      ) : (
        <div
          style={{
            ...card,
            textAlign: 'center',
            padding: '40px 24px',
            marginBottom: 14,
            borderColor: C.borderStrong,
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 650, color: C.text, marginBottom: 6 }}>Activity Tracking is Paused</div>
          <div style={{ fontSize: 12.5, color: C.dim, maxWidth: 440, margin: '0 auto 16px', lineHeight: 1.55 }}>
            Nothing is being recorded right now. Enable tracking above whenever you want to analyze your daily productivity and focus patterns.
          </div>
          <button style={button('primary')} onClick={() => void toggle(true)}>
            Enable Activity Tracking
          </button>
        </div>
      )}

      {/* Collapsible Privacy & Data Wipe Drawer */}
      <div style={{ ...card, background: 'rgba(255, 255, 255, 0.015)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <button
              onClick={() => setShowPrivacyDetails((v) => !v)}
              style={{
                background: 'transparent',
                border: 'none',
                color: C.dim,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span>{showPrivacyDetails ? '▾' : '▸'}</span> Data Management & Clear History
            </button>
          </div>

          <span style={{ fontSize: 11, color: C.faint }}>
            {range === 'today' ? `Today, ${WEEKDAYS[now.getDay()]}` : 'Last 7 Days'} · Stored Locally
          </span>
        </div>

        {showPrivacyDetails && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
            <div style={{ flex: 1, fontSize: 12, color: C.dim, lineHeight: 1.5 }}>
              Wipe all recorded application spans from Mochi&apos;s local SQLite database. This action is immediate and cannot be undone.
            </div>
            {confirmWipe ? (
              <div style={{ display: 'flex', gap: 8, shrink: 0 }}>
                <button style={button('ghost')} onClick={() => setConfirmWipe(false)}>
                  Cancel
                </button>
                <button
                  style={{ ...button('primary'), background: C.warn }}
                  onClick={() => void wipe()}
                >
                  Confirm Delete All
                </button>
              </div>
            ) : (
              <button style={button('ghost')} onClick={() => setConfirmWipe(true)}>
                Delete All Data
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
