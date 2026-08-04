import { useCallback, useEffect, useMemo, useState, type JSX } from 'react';
import {
  categoryIcon,
  elapsedMs,
  formatDuration,
  type MochiSettings,
  type Project,
  type TimerSnapshot,
  type WorkSession,
} from '@mochi/core';
import { button, C, card, h2, humanDuration, input, label, sub } from '../ui.js';
import { SegmentedControl } from '../SegmentedControl.js';

const QUICK_PRESETS = [
  { name: 'Work Time', colour: '#6366f1', icon: '💼' },
  { name: 'Personal Time', colour: '#ec4899', icon: '👤' },
  { name: 'Study & Research', colour: '#10b981', icon: '📚' },
  { name: 'Creative Focus', colour: '#f59e0b', icon: '🎨' },
  { name: 'Rest & Wellness', colour: '#8b5cf6', icon: '🧘' },
  { name: 'Side Project', colour: '#3b82f6', icon: '⚡' },
];

const EMOJI_OPTIONS = [
  '💼',
  '👤',
  '📚',
  '🎨',
  '🧘',
  '💻',
  '☕',
  '⚡',
  '🏋️',
  '🎧',
  '📝',
  '🎯',
  '🚀',
  '🛠️',
];
const SWATCH_OPTIONS = [
  '#6366f1',
  '#ec4899',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#3b82f6',
  '#F2A6B3',
  '#A6D6F2',
];

function formatCategoryName(name: string): string {
  const cleaned = name
    .replace(
      /^[\p{Emoji}\p{Extended_Pictographic}\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\s]+/gu,
      '',
    )
    .trim();
  return cleaned.length > 0 ? cleaned : name;
}

/** The small ◀ ▶ buttons that set a pinned category's place on the overlay. */
function slotArrow(disabled: boolean): React.CSSProperties {
  return {
    background: 'rgba(255, 255, 255, 0.06)',
    border: `1px solid ${C.border}`,
    color: disabled ? C.faint : C.text,
    borderRadius: 5,
    width: 22,
    height: 22,
    cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 10,
    padding: 0,
  };
}

type TimeSubTab = 'categories' | 'performance' | 'history';
type DateRangeFilter = 'today' | '7days' | '30days' | 'custom' | 'all';

export function TimeTab(): JSX.Element {
  const [subTab, setSubTab] = useState<TimeSubTab>('categories');
  const [dateRange, setDateRange] = useState<DateRangeFilter>('7days');
  const [customStartDate, setCustomStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0]!;
  });
  const [customEndDate, setCustomEndDate] = useState(() => new Date().toISOString().split('T')[0]!);
  const [sessions, setSessions] = useState<readonly WorkSession[]>([]);
  const [projects, setProjects] = useState<readonly Project[]>([]);
  const [settings, setSettings] = useState<MochiSettings | null>(null);
  const [timer, setTimer] = useState<TimerSnapshot | null>(null);

  // Form state
  const [newName, setNewName] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('💼');
  const [selectedColour, setSelectedColour] = useState('#6366f1');
  const [busy, setBusy] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  /** Removing a category takes its sessions with it, so it asks first. */
  const [confirmArchive, setConfirmArchive] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const sList = await window.mochi.timer.listSessions();
    const pList = await window.mochi.projects.list();
    const setObj = await window.mochi.settings.get();
    const tSnapshot = await window.mochi.timer.current();

    setSessions(sList);
    setProjects(pList);
    setSettings(setObj);
    setTimer(tSnapshot);

    // Auto-seed top 3 unique projects as primary if none set
    if ((setObj.primaryProjectIds?.length ?? 0) === 0 && pList.length > 0) {
      const defaultPrimary = pList.slice(0, 3).map((p) => p.id);
      void window.mochi.settings.setPrimaryProjects(defaultPrimary);
    }
  }, []);

  useEffect(() => {
    void reload();
    const offTimer = window.mochi.timer.onChange((s) => {
      setTimer(s);
      void reload();
    });
    const offSettings = window.mochi.settings.onChange(setSettings);
    return () => {
      offTimer();
      offSettings();
    };
  }, [reload]);

  // Keep ticking while timer is running
  useEffect(() => {
    if (timer === null || !timer.running) return;
    const id = setInterval(() => {
      void window.mochi.timer.current().then(setTimer);
    }, 1000);
    return () => clearInterval(id);
  }, [timer]);

  const togglePrimaryProject = useCallback(
    async (projectId: string) => {
      if (settings === null) return;
      const current = [...(settings.primaryProjectIds ?? [])];
      let updated: string[];

      if (current.includes(projectId)) {
        updated = current.filter((id) => id !== projectId);
      } else {
        // Full is full. This used to keep slots 1 and 2 and overwrite slot 3,
        // so pinning a fourth category silently threw one off the overlay with
        // no warning and no way to tell which. The button is disabled at 3
        // instead, and says why.
        if (current.length >= 3) return;
        updated = [...current, projectId];
      }

      const nextSettings = await window.mochi.settings.setPrimaryProjects(updated);
      setSettings(nextSettings);
    },
    [settings],
  );

  const movePrimaryProject = useCallback(
    async (index: number, direction: 'left' | 'right') => {
      if (settings === null) return;
      const current = [...(settings.primaryProjectIds ?? [])];
      const targetIndex = direction === 'left' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= current.length) return;

      const temp = current[index]!;
      current[index] = current[targetIndex]!;
      current[targetIndex] = temp;

      await window.mochi.settings.setPrimaryProjects(current);
      setSettings(await window.mochi.settings.get());
    },
    [settings],
  );

  const startOrStopSession = useCallback(
    async (projectId: string) => {
      if (timer?.running && timer.projectId === projectId) {
        // Stop current session
        const next = await window.mochi.timer.stop();
        setTimer(next);
      } else {
        // Toggle/switch to this project (enforcing 1 active session at a time)
        const next = await window.mochi.timer.toggle(projectId);
        setTimer(next);
      }
      await reload();
    },
    [timer, reload],
  );

  const createCategory = useCallback(
    async (nameOverride?: string, colourOverride?: string, iconOverride?: string) => {
      const rawName = (nameOverride || newName).trim();
      if (rawName.length === 0) return;

      const icon = iconOverride || selectedIcon;
      const fullDisplayName = `${icon} ${rawName}`;

      const existing = projects.find(
        (p) =>
          p.name.toLowerCase() === fullDisplayName.toLowerCase() ||
          p.name.toLowerCase() === rawName.toLowerCase() ||
          p.name.toLowerCase().endsWith(rawName.toLowerCase()),
      );

      const pIds = settings?.primaryProjectIds ?? [];
      if (existing) {
        if (settings && !pIds.includes(existing.id) && pIds.length < 3) {
          void window.mochi.settings.setPrimaryProjects([...pIds, existing.id]);
        }
        setNewName('');
        setShowCreateForm(false);
        return;
      }

      setBusy(true);
      try {
        const colour = colourOverride || selectedColour;
        const created = await window.mochi.projects.create(fullDisplayName, colour);
        setNewName('');
        setShowCreateForm(false);

        if (settings && pIds.length < 3) {
          void window.mochi.settings.setPrimaryProjects([...pIds, created.id]);
        }

        await reload();
      } finally {
        setBusy(false);
      }
    },
    [newName, selectedIcon, selectedColour, projects, settings, reload],
  );

  const archiveCategory = useCallback(
    async (projectId: string) => {
      const pIds = settings?.primaryProjectIds ?? [];
      if (settings && pIds.includes(projectId)) {
        const updatedPrimary = pIds.filter((id) => id !== projectId);
        void window.mochi.settings.setPrimaryProjects(updatedPrimary);
      }
      const updatedProjects = await window.mochi.projects.archive(projectId);
      setProjects(updatedProjects);
      await reload();
    },
    [settings, reload],
  );

  const totals = useMemo(() => {
    const now = Date.now();
    const byProject = new Map<string, { ms: number; count: number }>();
    for (const s of sessions) {
      const entry = byProject.get(s.projectId) ?? { ms: 0, count: 0 };
      entry.ms += elapsedMs(s, now);
      entry.count += 1;
      byProject.set(s.projectId, entry);
    }
    const rows = projects.map((p) => ({
      project: p,
      ...(byProject.get(p.id) ?? { ms: 0, count: 0 }),
    }));
    rows.sort((a, b) => b.ms - a.ms);
    const grand = rows.reduce((sum, r) => sum + r.ms, 0);
    return { rows, grand };
  }, [sessions, projects]);

  // Performance Filtering & Calculations
  const filteredSessions = useMemo(() => {
    const now = Date.now();
    if (dateRange === 'all') return sessions;

    if (dateRange === 'custom') {
      const startMs = new Date(customStartDate).setHours(0, 0, 0, 0);
      const endMs = new Date(customEndDate).setHours(23, 59, 59, 999);
      return sessions.filter((s) => s.startedAt >= startMs && s.startedAt <= endMs);
    }

    let startThreshold = 0;
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    if (dateRange === 'today') {
      startThreshold = startOfDay.getTime();
    } else if (dateRange === '7days') {
      startThreshold = now - 7 * 24 * 60 * 60 * 1000;
    } else if (dateRange === '30days') {
      startThreshold = now - 30 * 24 * 60 * 60 * 1000;
    }

    return sessions.filter((s) => s.startedAt >= startThreshold);
  }, [sessions, dateRange, customStartDate, customEndDate]);

  const performanceStats = useMemo(() => {
    const now = Date.now();
    const byProject = new Map<string, { ms: number; count: number }>();
    let totalMs = 0;

    for (const s of filteredSessions) {
      const dur = elapsedMs(s, now);
      totalMs += dur;
      const entry = byProject.get(s.projectId) ?? { ms: 0, count: 0 };
      entry.ms += dur;
      entry.count += 1;
      byProject.set(s.projectId, entry);
    }

    const categoryBreakdown = projects
      .map((p) => {
        const data = byProject.get(p.id) ?? { ms: 0, count: 0 };
        const pct = totalMs > 0 ? (data.ms / totalMs) * 100 : 0;
        return { project: p, ms: data.ms, count: data.count, pct };
      })
      .filter((c) => c.ms > 0);

    categoryBreakdown.sort((a, b) => b.ms - a.ms);

    const topCategory = categoryBreakdown.length > 0 ? categoryBreakdown[0] : null;
    const sessionCount = filteredSessions.length;
    const avgSessionMs = sessionCount > 0 ? totalMs / sessionCount : 0;

    // Peak hour calculation
    const hourBuckets = new Array(24).fill(0);
    for (const s of filteredSessions) {
      const h = new Date(s.startedAt).getHours();
      hourBuckets[h] += elapsedMs(s, now);
    }
    const maxMs = Math.max(...hourBuckets, 0);
    const peakHour = maxMs > 0 ? hourBuckets.indexOf(maxMs) : -1;
    let peakPeriod = 'No data yet';
    if (peakHour >= 0) {
      if (peakHour >= 12 && peakHour < 17) {
        peakPeriod = 'Afternoon (12 PM - 5 PM)';
      } else if (peakHour >= 17 && peakHour < 22) {
        peakPeriod = 'Evening (5 PM - 10 PM)';
      } else if (peakHour >= 22 || peakHour < 6) {
        peakPeriod = 'Night Focus (10 PM - 6 AM)';
      } else {
        peakPeriod = 'Morning (6 AM - 12 PM)';
      }
    }

    // Work / Study vs Rest Ratio
    const workStudyMs = categoryBreakdown
      .filter(
        (c) =>
          !c.project.name.toLowerCase().includes('rest') &&
          !c.project.name.toLowerCase().includes('wellness'),
      )
      .reduce((sum, c) => sum + c.ms, 0);
    const focusRatioPct = totalMs > 0 ? Math.round((workStudyMs / totalMs) * 100) : 0;

    return {
      totalMs,
      sessionCount,
      avgSessionMs,
      topCategory,
      peakPeriod,
      focusRatioPct,
      categoryBreakdown,
    };
  }, [filteredSessions, projects]);

  const primaryCount = settings?.primaryProjectIds?.length ?? 0;

  return (
    <div>
      {/* CSS Animation Keyframes for Smooth Tab Transitions */}
      <style>{`
        @keyframes fadeInSubTab {
          from {
            opacity: 0;
            transform: translateY(6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>

      {/* Apple-style Segmented Sub-Tab Switcher */}
      <SegmentedControl<TimeSubTab>
        style={{ marginBottom: 20 }}
        options={[
          {
            id: 'categories',
            label: 'Categories & Mascot Badges',
            icon: (
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect width="7" height="7" x="3" y="3" rx="1.5" />
                <rect width="7" height="7" x="14" y="3" rx="1.5" />
                <rect width="7" height="7" x="14" y="14" rx="1.5" />
                <rect width="7" height="7" x="3" y="14" rx="1.5" />
              </svg>
            ),
          },
          {
            id: 'performance',
            label: 'Performance & Reports',
            icon: (
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
            ),
          },
          {
            id: 'history',
            label: `Session History (${sessions.length})`,
            icon: (
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            ),
          },
        ]}
        value={subTab}
        onChange={setSubTab}
      />

      {subTab === 'categories' ? (
        <div key="categories" style={{ animation: 'fadeInSubTab 220ms ease-out' }}>
          {/* Header Bar */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 20,
            }}
          >
            <div>
              <h2 style={h2}>Time & Categories</h2>
              <p style={sub}>
                {sessions.length} session{sessions.length === 1 ? '' : 's'} ·{' '}
                {humanDuration(totals.grand)} total focus tracked.
              </p>
            </div>
            <button
              type="button"
              style={button(showCreateForm ? 'ghost' : 'primary')}
              onClick={() => setShowCreateForm(!showCreateForm)}
            >
              {showCreateForm ? 'Cancel' : '+ New Category'}
            </button>
          </div>

          {/* Hero Deck Card: Mochi Desktop Overlay Quick Slots */}
          <div
            style={{
              ...card,
              padding: '18px 20px',
              marginBottom: 24,
              background: 'rgba(34, 29, 41, 0.75)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 14,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16 }}>🤖</span>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: C.text }}>
                  Mochi Desktop Overlay Slots
                </span>
                <span
                  style={{
                    fontSize: 11,
                    padding: '2px 8px',
                    borderRadius: 12,
                    background: 'rgba(242, 166, 179, 0.15)',
                    color: C.accent,
                    fontWeight: 700,
                  }}
                >
                  {primaryCount} of 3 Pinned
                </span>
              </div>
              <span style={{ fontSize: 12, color: C.dim }}>
                Pin categories below to show them directly under Mochi on your desktop
              </span>
            </div>

            {/* 3 Interactive Slot Cards */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 12,
              }}
            >
              {[0, 1, 2].map((slotIdx) => {
                const id = settings?.primaryProjectIds?.[slotIdx];
                const p = id === undefined ? null : (projects.find((x) => x.id === id) ?? null);
                const currentId = timer?.projectId || timer?.session?.projectId || null;
                const isRunning = p !== null && timer?.running === true && currentId === p.id;
                const pTotals = p ? totals.rows.find((r) => r.project.id === p.id) : null;

                if (p === null) {
                  return (
                    <div
                      key={slotIdx}
                      style={{
                        padding: '14px 16px',
                        borderRadius: 12,
                        border: '1px dashed rgba(255, 255, 255, 0.15)',
                        background: 'rgba(0, 0, 0, 0.2)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minHeight: 110,
                        gap: 6,
                        textAlign: 'center',
                      }}
                    >
                      <span style={{ fontSize: 11, fontWeight: 700, color: C.faint }}>
                        SLOT {slotIdx + 1}
                      </span>
                      <span style={{ fontSize: 12.5, color: C.dim }}>Empty Slot</span>
                      <span style={{ fontSize: 11, color: C.faint }}>Pin a category below</span>
                    </div>
                  );
                }

                return (
                  <div
                    key={slotIdx}
                    style={{
                      padding: '14px 16px',
                      borderRadius: 12,
                      border: isRunning
                        ? `1.5px solid ${p.colour}`
                        : '1px solid rgba(255, 255, 255, 0.1)',
                      background: isRunning
                        ? `radial-gradient(circle at top left, ${p.colour}22, rgba(23, 19, 30, 0.9))`
                        : 'rgba(23, 19, 30, 0.6)',
                      boxShadow: isRunning
                        ? `0 4px 18px ${p.colour}33`
                        : '0 2px 8px rgba(0,0,0,0.2)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      minHeight: 110,
                      gap: 10,
                      transition: 'all 200ms ease',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span
                        style={{ fontSize: 10.5, fontWeight: 800, color: p.colour, opacity: 0.9 }}
                      >
                        SLOT {slotIdx + 1}
                      </span>
                      {isRunning && (
                        <span
                          style={{
                            fontSize: 10.5,
                            fontWeight: 700,
                            color: '#a8e6b8',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          ● LIVE
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: '50%',
                          background: `${p.colour}28`,
                          border: `1.5px solid ${p.colour}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 16,
                          flexShrink: 0,
                        }}
                      >
                        {categoryIcon(p.name)}
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            fontSize: 13.5,
                            fontWeight: 700,
                            color: C.text,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {formatCategoryName(p.name)}
                        </div>
                        <div style={{ fontSize: 11.5, color: C.dim, marginTop: 1 }}>
                          {humanDuration(pTotals?.ms || 0)} today
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <button
                        type="button"
                        onClick={() => void startOrStopSession(p.id)}
                        style={{
                          flex: 1,
                          padding: '6px 10px',
                          borderRadius: 8,
                          border: isRunning
                            ? '1px solid rgba(230, 57, 86, 0.5)'
                            : '1px solid rgba(242, 166, 179, 0.4)',
                          background: isRunning
                            ? 'linear-gradient(180deg, #4d232c 0%, #30141a 100%)'
                            : 'linear-gradient(180deg, #3f334c 0%, #282032 100%)',
                          color: isRunning ? '#ffb3c1' : '#ffffff',
                          fontSize: 11.5,
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 5,
                        }}
                      >
                        {isRunning ? '⏸ Pause' : '▶ Track'}
                      </button>
                      {/* Which slot a category occupies decides where it sits
                          under the mascot, so it has to be changeable from the
                          card that shows the slot. */}
                      <button
                        type="button"
                        title="Move earlier on the overlay"
                        disabled={slotIdx === 0}
                        onClick={() => void movePrimaryProject(slotIdx, 'left')}
                        style={slotArrow(slotIdx === 0)}
                      >
                        ◀
                      </button>
                      <button
                        type="button"
                        title="Move later on the overlay"
                        disabled={slotIdx >= primaryCount - 1}
                        onClick={() => void movePrimaryProject(slotIdx, 'right')}
                        style={slotArrow(slotIdx >= primaryCount - 1)}
                      >
                        ▶
                      </button>
                      <button
                        type="button"
                        title="Unpin from overlay"
                        onClick={() => void togglePrimaryProject(p.id)}
                        style={{
                          padding: '6px 10px',
                          borderRadius: 8,
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          background: 'rgba(255, 255, 255, 0.05)',
                          color: C.dim,
                          fontSize: 11.5,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Unpin
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Inline Create Category Form */}
          {showCreateForm && (
            <div style={{ ...card, marginBottom: 24, border: `1px solid ${C.accent}` }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text, marginBottom: 14 }}>
                ✨ Create New Focus Category
              </div>

              {/* Quick Presets */}
              <div style={{ marginBottom: 16 }}>
                <span style={label}>Or Pick a Quick Preset</span>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                  {QUICK_PRESETS.map((preset) => {
                    const exists = projects.some(
                      (p) => p.name.toLowerCase() === preset.name.toLowerCase(),
                    );
                    return (
                      <button
                        key={preset.name}
                        type="button"
                        disabled={busy}
                        onClick={() => void createCategory(preset.name, preset.colour, preset.icon)}
                        style={{
                          background: exists ? `${preset.colour}22` : 'rgba(255, 255, 255, 0.04)',
                          border: `1px solid ${exists ? preset.colour : 'rgba(255, 255, 255, 0.1)'}`,
                          borderRadius: 8,
                          padding: '7px 14px',
                          fontSize: 12,
                          fontWeight: 600,
                          color: C.text,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          transition: 'all 160ms ease',
                        }}
                      >
                        <span>{preset.icon}</span>
                        <span>{preset.name}</span>
                        {exists && <span style={{ fontSize: 10, color: C.accent }}>✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
                <span style={label}>Icon & Colour</span>

                {/* Icon Row */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                  {EMOJI_OPTIONS.map((ico) => (
                    <button
                      key={ico}
                      type="button"
                      onClick={() => setSelectedIcon(ico)}
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 8,
                        border: `1px solid ${selectedIcon === ico ? C.accent : 'rgba(255, 255, 255, 0.1)'}`,
                        background:
                          selectedIcon === ico ? `${C.accent}33` : 'rgba(255, 255, 255, 0.04)',
                        fontSize: 16,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {ico}
                    </button>
                  ))}
                </div>

                {/* Colour Swatches */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
                  {SWATCH_OPTIONS.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => setSelectedColour(hex)}
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        background: hex,
                        border: selectedColour === hex ? `2px solid ${C.text}` : 'none',
                        boxShadow: selectedColour === hex ? `0 0 10px ${hex}` : 'none',
                        cursor: 'pointer',
                      }}
                    />
                  ))}
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <input
                    type="text"
                    style={{ ...input, flex: 1, marginBottom: 0 }}
                    placeholder="Category Name (e.g., Client Work, Exercise)"
                    value={newName}
                    maxLength={30}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void createCategory();
                    }}
                  />
                  <button
                    type="button"
                    style={{ ...button('primary'), whiteSpace: 'nowrap' }}
                    disabled={busy || newName.trim().length === 0}
                    onClick={() => void createCategory()}
                  >
                    Save Category
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Structured Category List Cards Grid */}
          <div style={{ marginBottom: 20 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 14,
                padding: '0 4px',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                All Categories{' '}
                <span style={{ color: C.dim, fontWeight: 500 }}>({projects.length})</span>
              </div>
              <span style={{ fontSize: 12, color: C.dim }}>
                Pin up to 3 categories to Mochi&apos;s desktop overlay
              </span>
            </div>

            {totals.rows.length === 0 ? (
              <div
                style={{
                  ...card,
                  padding: '30px',
                  textAlign: 'center',
                  color: C.dim,
                  fontSize: 13,
                }}
              >
                No categories created yet. Click &quot;+ New Category&quot; above to add your first
                topic!
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {totals.rows.map(({ project, ms, count }) => {
                  const pct = totals.grand > 0 ? (ms / totals.grand) * 100 : 0;
                  const primaryIndex = settings?.primaryProjectIds?.indexOf(project.id) ?? -1;
                  const isPrimary = primaryIndex !== -1;
                  const currentProjectId = timer?.projectId || timer?.session?.projectId || null;
                  const isRunningThis = timer?.running === true && currentProjectId === project.id;
                  const asking = confirmArchive === project.id;

                  return (
                    <div
                      key={project.id}
                      style={{
                        ...card,
                        padding: '14px 18px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 16,
                        background: isRunningThis
                          ? `radial-gradient(circle at left, ${project.colour}22, ${C.panel})`
                          : C.panel,
                        border: isRunningThis
                          ? `1.5px solid ${project.colour}`
                          : '1px solid rgba(255, 255, 255, 0.08)',
                        boxShadow: isRunningThis
                          ? `0 4px 16px ${project.colour}28`
                          : '0 2px 8px rgba(0, 0, 0, 0.2)',
                        transition: 'all 180ms ease',
                      }}
                    >
                      {/* Left: Icon & Title */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          width: 220,
                          flexShrink: 0,
                        }}
                      >
                        <div
                          style={{
                            width: 38,
                            height: 38,
                            borderRadius: 10,
                            background: `${project.colour}22`,
                            border: `1px solid ${project.colour}66`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 18,
                            flexShrink: 0,
                          }}
                        >
                          {categoryIcon(project.name)}
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div
                            style={{
                              fontSize: 14,
                              fontWeight: 700,
                              color: C.text,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {formatCategoryName(project.name)}
                          </div>
                          {isRunningThis && (
                            <div
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color: project.colour,
                                marginTop: 2,
                              }}
                            >
                              ● Active Session
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Center: Progress & Stats */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginBottom: 6,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 13,
                              fontWeight: 700,
                              color: C.text,
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {humanDuration(ms)}
                          </span>
                          <span
                            style={{
                              fontSize: 11.5,
                              color: C.dim,
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {pct < 1 && pct > 0 ? '<1' : Math.round(pct)}% · {count} session
                            {count === 1 ? '' : 's'}
                          </span>
                        </div>
                        {/* Thick Rounded Progress Bar */}
                        <div
                          style={{
                            height: 6,
                            borderRadius: 4,
                            background: 'rgba(255, 255, 255, 0.08)',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              width: `${pct}%`,
                              height: '100%',
                              borderRadius: 4,
                              background: `linear-gradient(90deg, ${project.colour}, ${project.colour}dd)`,
                              boxShadow: `0 0 8px ${project.colour}66`,
                              transition: 'width 300ms ease',
                            }}
                          />
                        </div>
                      </div>

                      {/* Right: Permanent Action Bar (No Hover Required!) */}
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}
                      >
                        {asking ? (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setConfirmArchive(null);
                                void archiveCategory(project.id);
                              }}
                              style={{
                                ...button('danger'),
                                padding: '6px 12px',
                                fontSize: 11.5,
                              }}
                            >
                              Confirm Delete
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmArchive(null)}
                              style={{
                                ...button('ghost'),
                                padding: '6px 12px',
                                fontSize: 11.5,
                              }}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            {/* Pin / Unpin Overlay Control */}
                            <button
                              type="button"
                              disabled={!isPrimary && primaryCount >= 3}
                              title={
                                isPrimary
                                  ? `Overlay slot ${primaryIndex + 1} — click to unpin`
                                  : primaryCount >= 3
                                    ? 'All 3 overlay slots are full. Unpin one first.'
                                    : 'Pin to Mochi desktop overlay'
                              }
                              onClick={() => void togglePrimaryProject(project.id)}
                              style={{
                                padding: '6px 12px',
                                borderRadius: 8,
                                border: isPrimary
                                  ? `1px solid ${project.colour}88`
                                  : '1px solid rgba(255, 255, 255, 0.1)',
                                background: isPrimary
                                  ? `${project.colour}22`
                                  : 'rgba(255, 255, 255, 0.04)',
                                color: isPrimary
                                  ? project.colour
                                  : primaryCount >= 3
                                    ? C.faint
                                    : C.dim,
                                fontSize: 12,
                                fontWeight: isPrimary ? 750 : 500,
                                cursor: !isPrimary && primaryCount >= 3 ? 'not-allowed' : 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 5,
                                transition: 'all 160ms ease',
                              }}
                            >
                              {isPrimary ? `📌 Pinned #${primaryIndex + 1}` : '＋ Pin Overlay'}
                            </button>

                            {/* Main Track Session CTA */}
                            <button
                              type="button"
                              onClick={() => void startOrStopSession(project.id)}
                              style={{
                                padding: '6px 16px',
                                borderRadius: 8,
                                border: isRunningThis
                                  ? '1px solid rgba(230, 57, 86, 0.5)'
                                  : `1px solid ${project.colour}66`,
                                background: isRunningThis
                                  ? 'linear-gradient(180deg, #4d232c 0%, #30141a 100%)'
                                  : `linear-gradient(180deg, ${project.colour}33 0%, ${project.colour}11 100%)`,
                                color: isRunningThis ? '#ffb3c1' : C.text,
                                fontSize: 12,
                                fontWeight: 750,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                boxShadow: isRunningThis
                                  ? '0 3px 10px rgba(230, 57, 86, 0.4)'
                                  : '0 2px 6px rgba(0, 0, 0, 0.3)',
                                transition: 'all 160ms ease',
                              }}
                            >
                              {isRunningThis ? '⏸ Pause' : '▶ Track'}
                            </button>

                            {/* Archive Trash Button */}
                            {project.name !== 'General' && (
                              <button
                                type="button"
                                onClick={() => setConfirmArchive(project.id)}
                                title={`Delete ${formatCategoryName(project.name)}`}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: C.faint,
                                  fontSize: 14,
                                  cursor: 'pointer',
                                  padding: '4px 6px',
                                  opacity: 0.7,
                                  transition: 'opacity 160ms ease',
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.opacity = '1';
                                  e.currentTarget.style.color = '#ff8095';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.opacity = '0.7';
                                  e.currentTarget.style.color = C.faint;
                                }}
                              >
                                🗑️
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : subTab === 'performance' ? (
        /* Dedicated Performance & Reports Analytics Sub-Tab */
        <div key="performance" style={{ animation: 'fadeInSubTab 220ms ease-out' }}>
          {/* Header Bar & Date Period Filters */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 20,
            }}
          >
            <div>
              <h2 style={h2}>Performance & Reports</h2>
              <p style={sub}>
                Analyze how you manage focus time and category distribution across date ranges.
              </p>
            </div>

            {/* Date Range Filter Switcher */}
            <div
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}
            >
              <SegmentedControl<DateRangeFilter>
                options={[
                  { id: 'today', label: 'Today' },
                  { id: '7days', label: 'Last 7 Days' },
                  { id: '30days', label: 'Last 30 Days' },
                  { id: 'custom', label: 'Custom Range 📅' },
                  { id: 'all', label: 'All Time' },
                ]}
                value={dateRange}
                onChange={setDateRange}
              />

              {dateRange === 'custom' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11.5, color: C.dim }}>From:</span>
                    <input
                      type="date"
                      value={customStartDate}
                      onChange={(e) => setCustomStartDate(e.target.value)}
                      style={{
                        padding: '4px 8px',
                        borderRadius: 6,
                        background: '#181422',
                        border: `1px solid ${C.border}`,
                        color: C.text,
                        fontSize: 11.5,
                        outline: 'none',
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11.5, color: C.dim }}>To:</span>
                    <input
                      type="date"
                      value={customEndDate}
                      onChange={(e) => setCustomEndDate(e.target.value)}
                      style={{
                        padding: '4px 8px',
                        borderRadius: 6,
                        background: '#181422',
                        border: `1px solid ${C.border}`,
                        color: C.text,
                        fontSize: 11.5,
                        outline: 'none',
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
          {/* KPI Stat Cards Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 14,
              marginBottom: 24,
            }}
          >
            {/* Total Focus Time */}
            <div
              style={{
                ...card,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                background: 'rgba(34, 29, 41, 0.6)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(242, 166, 179, 0.25)',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)',
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 750,
                  color: C.dim,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={C.accent}
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <span>Total Focus Time</span>
              </div>
              <div
                style={{
                  fontSize: 26,
                  fontWeight: 800,
                  color: '#ffffff',
                  fontVariantNumeric: 'tabular-nums',
                  letterSpacing: '-0.02em',
                }}
              >
                {humanDuration(performanceStats.totalMs)}
              </div>
            </div>

            {/* Total Sessions */}
            <div
              style={{
                ...card,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                background: 'rgba(34, 29, 41, 0.6)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(168, 230, 184, 0.25)',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)',
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 750,
                  color: C.dim,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#a8e6b8"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="20" x2="18" y2="10" />
                  <line x1="12" y1="20" x2="12" y2="4" />
                  <line x1="6" y1="20" x2="6" y2="14" />
                </svg>
                <span>Focus Sessions</span>
              </div>
              <div
                style={{
                  fontSize: 26,
                  fontWeight: 800,
                  color: '#ffffff',
                  letterSpacing: '-0.02em',
                }}
              >
                {performanceStats.sessionCount}{' '}
                <span style={{ fontSize: 14, color: C.dim, fontWeight: 600 }}>
                  {performanceStats.sessionCount === 1 ? 'session' : 'sessions'}
                </span>
              </div>
            </div>

            {/* Avg Session Length */}
            <div
              style={{
                ...card,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                background: 'rgba(34, 29, 41, 0.6)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(139, 92, 246, 0.25)',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)',
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 750,
                  color: C.dim,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#8b5cf6"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
                <span>Avg Session Length</span>
              </div>
              <div
                style={{
                  fontSize: 26,
                  fontWeight: 800,
                  color: '#ffffff',
                  fontVariantNumeric: 'tabular-nums',
                  letterSpacing: '-0.02em',
                }}
              >
                {humanDuration(performanceStats.avgSessionMs)}
              </div>
            </div>

            {/* Peak Focus Window */}
            <div
              style={{
                ...card,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                background: 'rgba(34, 29, 41, 0.6)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255, 179, 193, 0.25)',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)',
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 750,
                  color: C.dim,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#ffb3c1"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M6 9H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h2" />
                  <path d="M18 9h2a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-2" />
                  <path d="M4 22h16" />
                  <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
                  <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
                  <path d="M18 2H6v7a6 6 0 0 0 12 0V2z" />
                </svg>
                <span>Peak Focus Window</span>
              </div>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 750,
                  color: C.accent,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  marginTop: 4,
                }}
              >
                {performanceStats.peakPeriod}
              </div>
            </div>
          </div>

          {/* Analytics Visual Grid: Donut Breakdown + Mochi Coach */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: 16,
              marginBottom: 24,
            }}
          >
            {/* Category Time Breakdown Donut Chart */}
            <div style={{ ...card, background: 'rgba(34, 29, 41, 0.75)', padding: '18px 20px' }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 750,
                  color: C.text,
                  letterSpacing: '0.04em',
                  marginBottom: 16,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span>🍩 Category Time Distribution</span>
              </div>

              {performanceStats.categoryBreakdown.length === 0 ? (
                <div
                  style={{ fontSize: 13, color: C.faint, padding: '30px 0', textAlign: 'center' }}
                >
                  No focus activity recorded for this period.
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
                  {/* SVG Conic Donut Chart */}
                  <div
                    style={{
                      position: 'relative',
                      width: 140,
                      height: 140,
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <svg width="140" height="140" viewBox="0 0 36 36">
                      <circle
                        cx="18"
                        cy="18"
                        r="15.91549430918954"
                        fill="transparent"
                        stroke="rgba(255, 255, 255, 0.05)"
                        strokeWidth="3.8"
                      />
                      {(() => {
                        let accumulatedPct = 0;
                        return performanceStats.categoryBreakdown.map((item) => {
                          const dashArray = `${item.pct} ${100 - item.pct}`;
                          const dashOffset = 100 - accumulatedPct + 25;
                          accumulatedPct += item.pct;
                          return (
                            <circle
                              key={item.project.id}
                              cx="18"
                              cy="18"
                              r="15.91549430918954"
                              fill="transparent"
                              stroke={item.project.colour}
                              strokeWidth="3.8"
                              strokeDasharray={dashArray}
                              strokeDashoffset={dashOffset}
                              style={{ transition: 'stroke-dasharray 400ms ease' }}
                            />
                          );
                        });
                      })()}
                    </svg>

                    <div
                      style={{
                        position: 'absolute',
                        textAlign: 'center',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                      }}
                    >
                      <span style={{ fontSize: 18, fontWeight: 800, color: C.text }}>
                        {performanceStats.categoryBreakdown.length}
                      </span>
                      <span
                        style={{
                          fontSize: 9.5,
                          fontWeight: 700,
                          color: C.dim,
                          textTransform: 'uppercase',
                        }}
                      >
                        Categories
                      </span>
                    </div>
                  </div>

                  {/* Right Donut Legend */}
                  <div
                    style={{
                      flex: 1,
                      minWidth: 160,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}
                  >
                    {performanceStats.categoryBreakdown.map((item) => (
                      <div
                        key={item.project.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          fontSize: 12,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              background: item.project.colour,
                              boxShadow: `0 0 6px ${item.project.colour}`,
                              flexShrink: 0,
                            }}
                          />
                          <span
                            style={{
                              color: C.text,
                              fontWeight: 600,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {formatCategoryName(item.project.name)}
                          </span>
                        </div>
                        <div style={{ fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
                          <span style={{ color: item.project.colour, fontWeight: 750 }}>
                            {item.pct.toFixed(1)}%
                          </span>
                          <span style={{ color: C.dim, fontSize: 11, marginLeft: 6 }}>
                            ({humanDuration(item.ms)})
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Smart Focus Insights & Mochi Productivity Coach Card */}
            <div
              style={{
                ...card,
                background: 'rgba(34, 29, 41, 0.75)',
                padding: '18px 20px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 750,
                    color: C.text,
                    letterSpacing: '0.04em',
                    marginBottom: 16,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <span>🧠 Productivity & Focus Insights</span>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: 12,
                      fontWeight: 700,
                      marginBottom: 6,
                    }}
                  >
                    <span style={{ color: C.text }}>🎯 Deep Work Focus Ratio</span>
                    <span style={{ color: C.accent, fontVariantNumeric: 'tabular-nums' }}>
                      {performanceStats.totalMs > 0 ? '100%' : '0%'}
                    </span>
                  </div>
                  <div
                    style={{
                      height: 6,
                      borderRadius: 4,
                      background: 'rgba(255, 255, 255, 0.08)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: performanceStats.totalMs > 0 ? '100%' : '0%',
                        height: '100%',
                        borderRadius: 4,
                        background: 'linear-gradient(90deg, #f2a6b3, #e58597)',
                        boxShadow: '0 0 8px rgba(242, 166, 179, 0.5)',
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Mochi Productivity Coach Banner */}
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: 10,
                  background: 'rgba(242, 166, 179, 0.08)',
                  border: '1px solid rgba(242, 166, 179, 0.25)',
                  marginTop: 10,
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 750,
                    color: C.accent,
                    marginBottom: 4,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span>💡 Mochi Productivity Coach</span>
                </div>
                <div style={{ fontSize: 12, color: C.text, lineHeight: 1.45 }}>
                  {performanceStats.topCategory
                    ? `You perform strongest in "${formatCategoryName(performanceStats.topCategory.project.name)}", your average session length is ${humanDuration(performanceStats.avgSessionMs)}, keeping you in a prime focus flow!`
                    : 'Track a session to unlock personalized Mochi focus recommendations.'}
                </div>
              </div>
            </div>
          </div>

          {/* Detailed Category Performance Table */}
          <div style={{ ...card, padding: '18px 20px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 16,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                Category Breakdown Table{' '}
                <span style={{ color: C.dim, fontWeight: 500 }}>
                  ({performanceStats.categoryBreakdown.length})
                </span>
              </div>
              <span style={{ fontSize: 12, color: C.dim }}>
                Detailed metrics across all tracked activities
              </span>
            </div>

            {performanceStats.categoryBreakdown.length === 0 ? (
              <div style={{ fontSize: 13, color: C.faint, padding: '24px 0', textAlign: 'center' }}>
                No focus activity logged for this time range. Select another date filter above!
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {performanceStats.categoryBreakdown.map((item) => (
                  <div
                    key={item.project.id}
                    style={{
                      background: 'rgba(24, 20, 34, 0.95)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: 12,
                      padding: '14px 18px',
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: 8,
                            background: `${item.project.colour}22`,
                            border: `1px solid ${item.project.colour}66`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 16,
                            flexShrink: 0,
                          }}
                        >
                          {categoryIcon(item.project.name)}
                        </div>
                        <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                          {formatCategoryName(item.project.name)}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        <span
                          style={{
                            fontSize: 13.5,
                            fontWeight: 750,
                            color: item.project.colour,
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {item.pct.toFixed(1)}%
                        </span>
                        <span
                          style={{ fontSize: 12, color: C.dim, fontVariantNumeric: 'tabular-nums' }}
                        >
                          {humanDuration(item.ms)} · {item.count} session
                          {item.count === 1 ? '' : 's'}
                        </span>
                      </div>
                    </div>

                    {/* Thick Rounded Progress Bar */}
                    <div
                      style={{
                        height: 6,
                        borderRadius: 4,
                        background: 'rgba(255, 255, 255, 0.08)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${item.pct}%`,
                          height: '100%',
                          borderRadius: 4,
                          background: `linear-gradient(90deg, ${item.project.colour}, ${item.project.colour}dd)`,
                          boxShadow: `0 0 8px ${item.project.colour}66`,
                          transition: 'width 300ms ease',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Dedicated Session History Sub-Tab */
        <div
          key="history"
          style={{ ...card, padding: '20px 24px', animation: 'fadeInSubTab 220ms ease-out' }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 20,
              paddingBottom: 16,
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            <div>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 750, color: C.text }}>
                🕒 Session History Log
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: 12.5, color: C.dim }}>
                Detailed chronological timeline of all your recorded focus sessions
              </p>
            </div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 750,
                color: C.accent,
                background: 'rgba(242, 166, 179, 0.15)',
                border: '1px solid rgba(242, 166, 179, 0.3)',
                padding: '6px 14px',
                borderRadius: 10,
              }}
            >
              {sessions.length} Sessions · {humanDuration(totals.grand)} Total Focus
            </div>
          </div>

          {sessions.length === 0 ? (
            <div style={{ fontSize: 13, color: C.dim, padding: '40px 0', textAlign: 'center' }}>
              No recorded focus sessions yet. Click "▶ Track" in Categories to log your first
              session!
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {sessions.map((s) => {
                const p = projects.find((x) => x.id === s.projectId);
                const color = p?.colour ?? C.accent;
                const rawName = p?.name ?? 'General Focus';
                const name = formatCategoryName(rawName);
                const icon = categoryIcon(rawName);
                const dateStr = new Date(s.startedAt).toLocaleString(undefined, {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                });
                const dur =
                  s.endedAt !== null ? formatDuration(s.endedAt - s.startedAt) : 'Running now';

                return (
                  <div
                    key={s.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: 'rgba(24, 20, 34, 0.95)',
                      border:
                        s.endedAt === null
                          ? `1.5px solid ${color}`
                          : '1px solid rgba(255, 255, 255, 0.08)',
                      boxShadow:
                        s.endedAt === null ? `0 4px 14px ${color}33` : '0 2px 6px rgba(0,0,0,0.2)',
                      borderRadius: 12,
                      padding: '12px 18px',
                      transition: 'all 160ms ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 10,
                          background: `${color}22`,
                          border: `1px solid ${color}66`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 17,
                          flexShrink: 0,
                        }}
                      >
                        {icon}
                      </div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{name}</div>
                        <div style={{ fontSize: 11.5, color: C.dim, marginTop: 2 }}>{dateStr}</div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 750,
                          color: s.endedAt === null ? '#a8e6b8' : '#ffffff',
                          fontVariantNumeric: 'tabular-nums',
                          background:
                            s.endedAt === null
                              ? 'rgba(168, 230, 184, 0.18)'
                              : 'linear-gradient(180deg, #3f334c 0%, #282032 100%)',
                          border:
                            s.endedAt === null
                              ? '1px solid rgba(168, 230, 184, 0.4)'
                              : '1px solid rgba(242, 166, 179, 0.35)',
                          padding: '5px 14px',
                          borderRadius: 8,
                          boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                        }}
                      >
                        {s.endedAt === null ? '● Running Now' : `${dur} session`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
