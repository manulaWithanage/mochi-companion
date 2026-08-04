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
import { button, C, card, humanDuration, WEEKDAYS } from '../ui.js';
import { NothingYet } from '../Emptiness.js';
import { SegmentedControl } from '../SegmentedControl.js';

const CATEGORY_COLOUR: Record<ActivityCategory, string> = {
  coding: '#3b82f6', // Vibrant Sapphire Blue
  design: '#ec4899', // Energetic Pink / Magenta
  writing: '#06b6d4', // Electric Cyan
  terminal: '#10b981', // Vivid Emerald Mint
  meeting: '#f59e0b', // Radiant Amber Gold
  communication: '#ff6b00', // Bright Coral Orange
  browsing: '#8b5cf6', // Deep Royal Purple / Violet
  gaming: '#14b8a6', // Vibrant Teal
  media: '#f43f5e', // Bright Rose Crimson
  other: '#64748b', // Slate Grey
};

type Range = 'today' | 'week';

/** Sleek hover tooltip component for contextual UX help */
const Tooltip = ({
  content,
  children,
  width = 280,
  align = 'center',
}: {
  readonly content: React.ReactNode;
  readonly children: React.ReactNode;
  readonly width?: number;
  readonly align?: 'left' | 'center' | 'right';
}): JSX.Element => {
  const [hovered, setHovered] = useState(false);

  const getLeftStyle = () => {
    if (align === 'left') return { left: 0, transform: 'translateY(-6px)' };
    if (align === 'right') return { right: 0, transform: 'translateY(-6px)' };
    return { left: '50%', transform: 'translateX(-50%) translateY(-6px)' };
  };

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
            ...getLeftStyle(),
            width,
            maxWidth: '90vw',
            padding: '10px 14px',
            borderRadius: 10,
            background: '#241f2b',
            border: '1px solid #3b3244',
            boxShadow: '0 12px 32px rgba(0, 0, 0, 0.65)',
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
              left: align === 'left' ? '16px' : align === 'right' ? 'calc(100% - 24px)' : '50%',
              transform: align === 'center' ? 'translateX(-50%)' : 'none',
              borderWidth: 6,
              borderStyle: 'solid',
              borderColor: '#3b3244 transparent transparent transparent',
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
  <div
    style={{
      ...card,
      flex: 1,
      padding: '16px 18px',
      background: 'rgba(34, 29, 41, 0.6)',
      backdropFilter: 'blur(8px)',
      border: `1px solid ${C.border}`,
      transition: 'border-color 0.2s, transform 0.2s',
    }}
  >
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 4,
      }}
    >
      <div
        style={{
          fontSize: 24,
          fontWeight: 700,
          letterSpacing: '-0.02em',
          color: accent === true ? C.accent : C.text,
        }}
      >
        {value}
      </div>
      {tooltip !== undefined && (
        <Tooltip content={tooltip} width={220} align="right">
          <span style={{ fontSize: 12, color: C.faint, cursor: 'help' }}>ⓘ</span>
        </Tooltip>
      )}
    </div>
    <div style={{ fontSize: 12, color: C.dim, fontWeight: 450 }}>{caption}</div>
  </div>
);

/** Visual activity timeline strip */
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
    <div style={{ ...card, marginBottom: 16, background: 'rgba(34, 29, 41, 0.6)' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <span style={{ fontSize: 12.5, fontWeight: 600, color: C.text, letterSpacing: '0.01em' }}>
          Daily Timeline
        </span>
        <Tooltip
          content="Shows continuous active blocks throughout today. Keyboard idle time is automatically filtered out."
          width={260}
          align="right"
        >
          <span style={{ fontSize: 11.5, color: C.faint, cursor: 'help' }}>How it works ⓘ</span>
        </Tooltip>
      </div>

      <div
        style={{
          position: 'relative',
          height: 24,
          borderRadius: 6,
          background: 'rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          border: '1px solid rgba(255, 255, 255, 0.05)',
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
              opacity: 0.9,
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

  const effectiveSpans = useMemo(() => {
    const overrides = settings?.learnedAppCategories;
    if (!overrides || Object.keys(overrides).length === 0) return spans;
    return spans.map((s) => ({
      ...s,
      category: (overrides[s.app] as ActivityCategory) || s.category,
    }));
  }, [spans, settings?.learnedAppCategories]);

  const apps = useMemo(() => totalsByApp(effectiveSpans), [effectiveSpans]);
  const categories = useMemo(
    () => totalsByCategory(effectiveSpans).filter((c) => c.ms > 0),
    [effectiveSpans],
  );
  const totalMs = useMemo(() => apps.reduce((sum, a) => sum + a.ms, 0), [apps]);
  const focused = useMemo(() => focusedMs(effectiveSpans), [effectiveSpans]);
  const switches = useMemo(() => switchCount(effectiveSpans), [effectiveSpans]);
  const longest = useMemo(() => longestStretchMs(effectiveSpans), [effectiveSpans]);

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
    <div style={{ maxWidth: 880, margin: '0 auto' }}>
      {/* Sleek Minimalist Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 20,
        }}
      >
        <div>
          <h2
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: '-0.02em',
              color: C.text,
            }}
          >
            Activity
          </h2>
        </div>

        {/* Apple-style Segmented Time Range Selector */}
        <SegmentedControl<'today' | 'week'>
          options={[
            { id: 'today', label: 'Today' },
            { id: 'week', label: 'Last 7 Days' },
          ]}
          value={range}
          onChange={(newRange) => {
            setRange(newRange);
            reload(newRange, new Date());
          }}
        />
      </div>

      {/* Clean Single-Row Toolbar (No bulky container card) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 0 18px',
          marginBottom: 16,
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        {/* Left: Status & Local Privacy Tooltip */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: tracking ? C.good : C.warn,
                boxShadow: tracking ? '0 0 10px rgba(168, 230, 184, 0.6)' : 'none',
              }}
            />
            <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
              {tracking ? 'Tracking Active' : 'Tracking Paused'}
            </span>
          </div>

          <span style={{ color: C.borderStrong, fontSize: 12 }}>|</span>

          <Tooltip
            content={
              <div>
                <strong style={{ color: C.good, display: 'block', marginBottom: 4 }}>
                  🔒 100% Local Privacy
                </strong>
                Only application names in front are recorded. Idle time is discarded. Data is kept
                purely in Mochi&apos;s local SQLite database and auto-purges after 90 days.
              </div>
            }
            width={300}
            align="left"
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 12,
                color: C.dim,
                cursor: 'help',
                transition: 'color 0.15s',
              }}
            >
              <span>Local Privacy</span>
              <span style={{ fontSize: 11, color: C.faint }}>ⓘ</span>
            </span>
          </Tooltip>
        </div>

        {/* Right: Site Splitting Chip & Primary Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {tracking && (
            <Tooltip
              content={
                <div>
                  <strong style={{ color: C.accent, display: 'block', marginBottom: 4 }}>
                    🌐 Site Splitting
                  </strong>
                  Differentiates sites like YouTube vs research docs. Window titles are checked
                  in-memory against supported sites and instantly discarded.
                  <div style={{ marginTop: 6, fontSize: 11, color: C.dim }}>
                    <strong>Includes:</strong> {KNOWN_SITES.slice(0, 8).join(', ')}, etc.
                  </div>
                </div>
              }
              width={280}
              align="right"
            >
              <button
                onClick={() => void toggleSites(!sites)}
                style={{
                  border: `1px solid ${sites ? 'rgba(242, 166, 179, 0.35)' : C.border}`,
                  background: sites ? 'rgba(242, 166, 179, 0.1)' : 'transparent',
                  color: sites ? C.accent : C.dim,
                  fontSize: 12,
                  fontWeight: 550,
                  padding: '5px 12px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 0.15s ease',
                }}
              >
                <span>Site Splitting: {sites ? 'On' : 'Off'}</span>
                <span style={{ fontSize: 10, opacity: 0.7 }}>ⓘ</span>
              </button>
            </Tooltip>
          )}

          <button
            style={{
              padding: '6px 14px',
              borderRadius: 8,
              border: tracking ? `1px solid ${C.borderStrong}` : 'none',
              background: tracking ? 'transparent' : C.accent,
              color: tracking ? C.text : '#241f2b',
              fontSize: 12.5,
              fontWeight: 600,
              cursor: supported === false ? 'default' : 'pointer',
              opacity: supported === false ? 0.5 : 1,
              transition: 'all 0.15s ease',
            }}
            disabled={supported === false}
            onClick={() => void toggle(!tracking)}
          >
            {tracking ? 'Pause' : 'Start Tracking'}
          </button>
        </div>
      </div>

      {/* Content Section */}
      {tracking ? (
        <>
          {totalMs === 0 ? (
            <div style={{ margin: '20px 0' }}>
              <NothingYet
                headline="Nothing recorded yet"
                detail="Samples arrive every few minutes while you work. Your timeline, categories and app list will fill in on their own."
              />
            </div>
          ) : (
            <>
              {/* Timeline Chart */}
              {range === 'today' && (
                <Timeline spans={effectiveSpans} from={bounds.from} to={bounds.to} />
              )}

              {/* Core Key Stats */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                <Stat
                  value={humanDuration(totalMs)}
                  caption="Active Time"
                  accent
                  tooltip="Total time active at the keyboard/mouse."
                />
                <Stat
                  value={humanDuration(focused)}
                  caption="Focused Apps"
                  tooltip="Time spent inside productivity and work apps."
                />
                <Stat
                  value={humanDuration(longest)}
                  caption="Longest Stretch"
                  tooltip="Your single longest continuous block of focus today."
                />
                <Stat
                  value={String(switches)}
                  caption="App Switches"
                  tooltip="Total number of app switches."
                />
              </div>

              {/* Work Category Breakdown */}
              <div style={{ ...card, marginBottom: 16, background: 'rgba(34, 29, 41, 0.6)' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 12,
                  }}
                >
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: C.text }}>
                    Work Breakdown
                  </span>
                  <Tooltip
                    content="Automatically categorized from active app names. You can reassign categories below."
                    width={250}
                    align="right"
                  >
                    <span style={{ fontSize: 11.5, color: C.faint, cursor: 'help' }}>ⓘ</span>
                  </Tooltip>
                </div>

                <div
                  style={{
                    display: 'flex',
                    height: 12,
                    borderRadius: 6,
                    overflow: 'hidden',
                    background: 'rgba(0, 0, 0, 0.3)',
                    marginBottom: 16,
                    boxShadow: 'inset 0 1px 3px rgba(0, 0, 0, 0.4)',
                  }}
                >
                  {categories.map((c) => (
                    <div
                      key={c.category}
                      title={`${c.label}: ${humanDuration(c.ms)}`}
                      style={{
                        width: `${c.share * 100}%`,
                        background: CATEGORY_COLOUR[c.category],
                        boxShadow: `0 0 8px ${CATEGORY_COLOUR[c.category]}44`,
                        transition: 'width 240ms ease',
                      }}
                    />
                  ))}
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                  {categories.map((c) => (
                    <span
                      key={c.category}
                      style={{
                        fontSize: 12,
                        color: C.dim,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 7,
                      }}
                    >
                      <span
                        style={{
                          width: 9,
                          height: 9,
                          borderRadius: 3,
                          background: CATEGORY_COLOUR[c.category],
                          boxShadow: `0 0 6px ${CATEGORY_COLOUR[c.category]}88`,
                        }}
                      />
                      <span>{c.label}</span>
                      <strong
                        style={{
                          color: C.text,
                          fontWeight: 650,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {humanDuration(c.ms)}
                      </strong>
                    </span>
                  ))}
                </div>
              </div>

              {/* Applications List */}
              <div style={{ ...card, marginBottom: 20, background: 'rgba(34, 29, 41, 0.6)' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 14,
                  }}
                >
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: C.text }}>
                    Applications Used
                  </span>
                  <Tooltip
                    content="Reassign an application's category using the dropdown if Mochi categorized it incorrectly."
                    width={260}
                    align="right"
                  >
                    <span style={{ fontSize: 11.5, color: C.faint, cursor: 'help' }}>
                      Category Help ⓘ
                    </span>
                  </Tooltip>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {apps.slice(0, 12).map((a) => (
                    <div key={a.app} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span
                        style={{
                          fontSize: 12.5,
                          color: C.text,
                          minWidth: 140,
                          maxWidth: 180,
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
                          height: 8,
                          borderRadius: 4,
                          background: 'rgba(0, 0, 0, 0.3)',
                          overflow: 'hidden',
                          boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.3)',
                        }}
                      >
                        <div
                          style={{
                            width: `${Math.max(2, a.share * 100)}%`,
                            height: '100%',
                            borderRadius: 4,
                            background: CATEGORY_COLOUR[a.category],
                            boxShadow: `0 0 8px ${CATEGORY_COLOUR[a.category]}66`,
                            transition: 'width 240ms ease, background-color 240ms ease',
                          }}
                        />
                      </div>
                      <span
                        style={{
                          fontSize: 11.5,
                          color: C.text,
                          minWidth: 54,
                          textAlign: 'right',
                          fontVariantNumeric: 'tabular-nums',
                          fontWeight: 600,
                        }}
                      >
                        {humanDuration(a.ms)}
                      </span>

                      <select
                        value={a.category}
                        onChange={(e) =>
                          void recategorise(a.app, e.target.value as ActivityCategory)
                        }
                        title={`Categorized as ${activityCategoryInfo(a.category).label}. Click to reassign.`}
                        style={{
                          background: `${CATEGORY_COLOUR[a.category]}1e`,
                          border: `1px solid ${CATEGORY_COLOUR[a.category]}55`,
                          borderRadius: 7,
                          color: '#ffffff',
                          fontSize: 11.5,
                          fontWeight: 600,
                          padding: '4px 8px',
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          outline: 'none',
                          boxShadow: '0 2px 6px rgba(0, 0, 0, 0.25)',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {ACTIVITY_CATEGORIES.map((c) => (
                          <option
                            key={c.id}
                            value={c.id}
                            style={{ background: '#241f2b', color: C.text }}
                          >
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
            padding: '44px 24px',
            marginBottom: 20,
            background: 'rgba(34, 29, 41, 0.4)',
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 650, color: C.text, marginBottom: 6 }}>
            Tracking is Paused
          </div>
          <div
            style={{
              fontSize: 12.5,
              color: C.dim,
              maxWidth: 420,
              margin: '0 auto 16px',
              lineHeight: 1.55,
            }}
          >
            No activity is recorded while paused. Enable tracking to view your work metrics and
            focus patterns.
          </div>
          <button style={button('primary')} onClick={() => void toggle(true)}>
            Enable Activity Tracking
          </button>
        </div>
      )}

      {/* Subtle Data Management Footer */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: 12,
          borderTop: `1px solid ${C.border}`,
        }}
      >
        <button
          onClick={() => setShowPrivacyDetails((v) => !v)}
          style={{
            background: 'transparent',
            border: 'none',
            color: C.faint,
            fontSize: 11.5,
            cursor: 'pointer',
            padding: 0,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            transition: 'color 0.15s',
          }}
        >
          <span>{showPrivacyDetails ? '▾ Hide Data Controls' : '▸ Manage Activity Data'}</span>
        </button>

        <span style={{ fontSize: 11, color: C.faint }}>
          {range === 'today' ? `Today, ${WEEKDAYS[now.getDay()]}` : 'Last 7 Days'} · Stored Locally
        </span>
      </div>

      {showPrivacyDetails && (
        <div
          style={{
            ...card,
            marginTop: 12,
            background: 'rgba(255, 255, 255, 0.02)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 14,
          }}
        >
          <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.5 }}>
            Purge all recorded activity spans from local database storage. Cannot be undone.
          </div>
          {confirmWipe ? (
            <div style={{ display: 'flex', gap: 8 }}>
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
  );
}
