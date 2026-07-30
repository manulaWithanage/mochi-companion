import { useCallback, useEffect, useMemo, useState, type JSX } from 'react';
import {
  activityCategoryInfo,
  focusedMs,
  longestStretchMs,
  spansWithin,
  switchCount,
  totalsByApp,
  totalsByCategory,
  KNOWN_SITES,
  type ActivityCategory,
  type ActivitySpan,
  type MochiSettings,
} from '@mochi/core';
import { button, C, card, h2, humanDuration, sub, WEEKDAYS } from '../ui.js';

/**
 * What you actually used, at application granularity.
 *
 * Two things this tab has to be honest about, and states outright rather than
 * burying in a settings page:
 *
 * 1. Window titles are never read. Only the foreground process name, so there
 *    are no document names, client names or URLs to leak — not even to disk.
 * 2. Idle time is discarded. A machine left unlocked overnight does not become
 *    eight hours of whatever was on screen.
 *
 * Tracking is off until the user turns it on, and "Delete everything" is a
 * button on this page rather than a support request.
 */

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

  const reload = useCallback(
    (which: Range, at: Date) => {
      const { from, to } = rangeBounds(which, at);
      void window.mochi.activity
        .list(from, to)
        .then((rows) => setSpans(spansWithin(rows, from, to)))
        .catch(() => setSpans([]));
    },
    [],
  );

  useEffect(() => {
    void window.mochi.settings.get().then(setSettings);
    void window.mochi.activity.supported().then(setSupported);
    reload(range, now);

    const offSettings = window.mochi.settings.onChange(setSettings);
    // Buffered samples only reach the list every couple of minutes, so a slow
    // refresh is enough and keeps this tab off the critical path.
    const tick = setInterval(() => {
      const next = new Date();
      setNow(next);
      reload(range, next);
    }, 60_000);

    return () => {
      offSettings();
      clearInterval(tick);
    };
  }, [range, now, reload]);

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

  const wipe = useCallback(async () => {
    await window.mochi.activity.forgetAll();
    setConfirmWipe(false);
    setSpans([]);
  }, []);

  return (
    <div>
      <h2 style={h2}>Activity</h2>
      <p style={sub}>Which applications you were actually in, measured on this machine.</p>

      {/* ---- the promise, stated before anything is recorded ---- */}
      <div
        style={{
          ...card,
          marginBottom: 14,
          borderColor: 'rgba(168, 230, 184, 0.25)',
          background: 'rgba(168, 230, 184, 0.06)',
        }}
      >
        <div style={{ fontSize: 13, color: C.good, fontWeight: 600, marginBottom: 6 }}>
          What is recorded
        </div>
        <div style={{ fontSize: 12.5, color: C.dim, lineHeight: 1.65 }}>
          The name of the app in front, and nothing else. Time when you are away from the keyboard
          is discarded rather than counted. Everything stays in Mochi&apos;s local database, never
          leaves this machine, and is deleted after 90 days.
          {sites
            ? ' Site tracking is on, so browser titles are checked against the fixed list below and nothing else is kept.'
            : ' Window titles are never read, so no document names, browser tabs or message contents can reach the disk.'}
        </div>
      </div>

      {/* ---- the switch ---- */}
      <div style={{ ...card, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, color: C.text, marginBottom: 3 }}>
              {tracking ? 'Tracking is on' : 'Tracking is off'}
            </div>
            <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.5 }}>
              {supported === false
                ? 'Not available on this platform yet. Windows only for now.'
                : tracking
                  ? 'Sampled every 10 seconds while you are at the keyboard.'
                  : 'Nothing is being recorded. Turn it on to see where your day goes.'}
            </div>
          </div>
          <button
            style={button(tracking ? 'ghost' : 'primary')}
            disabled={supported === false}
            onClick={() => void toggle(!tracking)}
          >
            {tracking ? 'Turn off' : 'Turn on'}
          </button>
        </div>
      </div>

      {tracking && (
        <div style={{ ...card, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, color: C.text, marginBottom: 3 }}>
                Split browsing into sites
              </div>
              <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.55 }}>
                Tells YouTube from research. This is the one feature that needs the browser window
                title, so it is separate and off by default. The title is compared against the list
                below and thrown away in the same instant — only a name from that list is ever
                recorded, so anything not on it cannot be.
              </div>
            </div>
            <button
              style={button(sites ? 'ghost' : 'primary')}
              onClick={() => void toggleSites(!sites)}
            >
              {sites ? 'Turn off' : 'Turn on'}
            </button>
          </div>

          <div style={{ fontSize: 11.5, color: C.faint, marginTop: 10, lineHeight: 1.6 }}>
            <span style={{ color: C.dim }}>The complete list:</span> {KNOWN_SITES.join(' · ')}
          </div>
        </div>
      )}

      {tracking && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            {(['today', 'week'] as const).map((r) => (
              <button
                key={r}
                style={{
                  ...button(range === r ? 'primary' : 'ghost'),
                  fontSize: 12,
                  padding: '5px 14px',
                }}
                onClick={() => {
                  setRange(r);
                  reload(r, new Date());
                }}
              >
                {r === 'today' ? 'Today' : 'Last 7 days'}
              </button>
            ))}
          </div>

          {totalMs === 0 ? (
            <div
              style={{
                ...card,
                borderStyle: 'dashed',
                background: 'transparent',
                textAlign: 'center',
                padding: '32px 24px',
              }}
            >
              <div style={{ fontSize: 13, color: C.text, marginBottom: 4 }}>Nothing recorded yet</div>
              <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.55 }}>
                The first spans appear a couple of minutes after tracking starts. Keep working and
                come back.
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                <Stat value={humanDuration(totalMs)} caption="at the keyboard" accent />
                <Stat value={humanDuration(focused)} caption="in focused apps" />
                <Stat value={humanDuration(longest)} caption="longest stretch" />
                <Stat value={String(switches)} caption="app switches" />
              </div>

              {/* category bar */}
              <div style={{ ...card, marginBottom: 14 }}>
                <div style={{ fontSize: 12, color: C.dim, marginBottom: 10 }}>By kind of work</div>
                <div
                  style={{
                    display: 'flex',
                    height: 12,
                    borderRadius: 6,
                    overflow: 'hidden',
                    background: 'rgba(255,255,255,0.04)',
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
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 12 }}>
                  {categories.map((c) => (
                    <span
                      key={c.category}
                      style={{ fontSize: 11.5, color: C.dim, display: 'flex', gap: 6 }}
                    >
                      <span
                        style={{
                          width: 9,
                          height: 9,
                          borderRadius: 3,
                          background: CATEGORY_COLOUR[c.category],
                          transform: 'translateY(2px)',
                        }}
                      />
                      {c.label} {humanDuration(c.ms)}
                    </span>
                  ))}
                </div>
              </div>

              {/* app list */}
              <div style={{ ...card, marginBottom: 14 }}>
                <div style={{ fontSize: 12, color: C.dim, marginBottom: 12 }}>Applications</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {apps.slice(0, 12).map((a) => (
                    <div key={a.app} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span
                        style={{
                          fontSize: 12.5,
                          color: C.text,
                          minWidth: 120,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {a.app}
                      </span>
                      <div
                        style={{
                          flex: 1,
                          height: 7,
                          borderRadius: 4,
                          background: 'rgba(255,255,255,0.04)',
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
                          color: C.faint,
                          minWidth: 56,
                          textAlign: 'right',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {humanDuration(a.ms)}
                      </span>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: C.faint, marginTop: 12, lineHeight: 1.5 }}>
                  {activityCategoryInfo('browsing').label} is one bar because the browser is one
                  application. Telling research from anything else would mean reading tab titles,
                  which Mochi does not do.
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* ---- deletion, offered rather than buried ---- */}
      <div style={{ ...card }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, color: C.text, marginBottom: 3 }}>Delete everything</div>
            <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.5 }}>
              Removes every recorded span. Cannot be undone, and does not need to be asked for.
            </div>
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
                Delete
              </button>
            </div>
          ) : (
            <button style={button('ghost')} onClick={() => setConfirmWipe(true)}>
              Delete
            </button>
          )}
        </div>
      </div>

      <p style={{ ...sub, marginTop: 14, fontSize: 11.5 }}>
        {range === 'today'
          ? `Today, ${WEEKDAYS[now.getDay()]}`
          : 'Last 7 days'} · sampled locally, never uploaded.
      </p>
    </div>
  );
}
