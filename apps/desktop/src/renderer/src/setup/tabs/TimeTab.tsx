import { useCallback, useEffect, useMemo, useState, type JSX } from 'react';
import {
  elapsedMs,
  formatDuration,
  type MochiSettings,
  type Project,
  type TimerSnapshot,
  type WorkSession,
} from '@mochi/core';
import { button, C, card, h2, humanDuration, input, label, sub } from '../ui.js';

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
  if (name === 'General') {
    return '🎯 General';
  }
  return name;
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
type DateRangeFilter = 'today' | '7days' | '30days' | 'all';

export function TimeTab(): JSX.Element {
  const [subTab, setSubTab] = useState<TimeSubTab>('categories');
  const [dateRange, setDateRange] = useState<DateRangeFilter>('7days');
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
  }, [sessions, dateRange]);

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
      {/* Sub-Tab Navigation Pill Switcher */}
      <div
        style={{
          display: 'flex',
          gap: 6,
          marginBottom: 18,
          background: 'rgba(23, 19, 34, 0.9)',
          padding: 4,
          borderRadius: 10,
          border: `1px solid ${C.border}`,
          width: 'fit-content',
        }}
      >
        <button
          type="button"
          onClick={() => setSubTab('categories')}
          style={{
            background: subTab === 'categories' ? C.accent : 'transparent',
            color: subTab === 'categories' ? '#ffffff' : C.dim,
            border: 'none',
            borderRadius: 7,
            padding: '6px 14px',
            fontSize: 12.5,
            fontWeight: 650,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            transition: 'all 140ms ease',
          }}
        >
          <span>▤</span>
          <span>Categories & Mascot Badges</span>
        </button>
        <button
          type="button"
          onClick={() => setSubTab('performance')}
          style={{
            background: subTab === 'performance' ? C.accent : 'transparent',
            color: subTab === 'performance' ? '#ffffff' : C.dim,
            border: 'none',
            borderRadius: 7,
            padding: '6px 14px',
            fontSize: 12.5,
            fontWeight: 650,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            transition: 'all 140ms ease',
          }}
        >
          <span>📊</span>
          <span>Performance & Reports</span>
        </button>
        <button
          type="button"
          onClick={() => setSubTab('history')}
          style={{
            background: subTab === 'history' ? C.accent : 'transparent',
            color: subTab === 'history' ? '#ffffff' : C.dim,
            border: 'none',
            borderRadius: 7,
            padding: '6px 14px',
            fontSize: 12.5,
            fontWeight: 650,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            transition: 'all 140ms ease',
          }}
        >
          <span>🕒</span>
          <span>Session History ({sessions.length})</span>
        </button>
      </div>

      {subTab === 'categories' ? (
        <div>
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

          {/*
            The overlay, at a glance.

            This was a 200px panel repeating the three category names that are
            already in the list below, with "3 / 3 Active" above it and
            "3 / 3 Mascot Quick-Trackers Pinned" below -- the same fact stated
            three times. Slot order and unpinning now live on the rows
            themselves, where the categories are, so this only has to show what
            Mochi is actually carrying.
          */}
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(35, 27, 48, 0.9), rgba(22, 17, 30, 0.95))',
              border: `1px solid ${C.border}`,
              borderRadius: 14,
              padding: '12px 16px',
              marginBottom: 20,
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              flexWrap: 'wrap',
            }}
          >
            <span style={{ fontSize: 12, color: C.dim, whiteSpace: 'nowrap' }}>
              ⭐ On Mochi&apos;s overlay
            </span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flex: 1 }}>
              {[0, 1, 2].map((slotIdx) => {
                const id = settings?.primaryProjectIds?.[slotIdx];
                const p = id === undefined ? null : (projects.find((x) => x.id === id) ?? null);
                return (
                  <span
                    key={slotIdx}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 7,
                      fontSize: 12,
                      fontWeight: 600,
                      padding: '5px 11px',
                      borderRadius: 999,
                      border: `1px solid ${p === null ? C.border : p.colour}`,
                      background: p === null ? 'transparent' : `${p.colour}18`,
                      color: p === null ? C.faint : C.text,
                    }}
                  >
                    <span style={{ fontSize: 10, color: p === null ? C.faint : p.colour }}>
                      {slotIdx + 1}
                    </span>
                    {p === null ? 'empty' : formatCategoryName(p.name)}
                  </span>
                );
              })}
            </div>
            <span style={{ fontSize: 11.5, color: C.faint, whiteSpace: 'nowrap' }}>
              Pin below to fill a slot
            </span>
          </div>

          {/* Inline Create Category Form */}
          {showCreateForm && (
            <div style={{ ...card, marginBottom: 20, border: `1px solid ${C.accent}` }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 12 }}>
                ✨ Create New Category
              </div>

              {/* Quick Presets */}
              <div style={{ marginBottom: 14 }}>
                <span style={label}>Or Pick a Quick Preset</span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  {QUICK_PRESETS.map((preset) => {
                    const exists = projects.some((p) =>
                      p.name.toLowerCase().includes(preset.name.toLowerCase()),
                    );
                    return (
                      <button
                        key={preset.name}
                        type="button"
                        disabled={busy}
                        onClick={() => void createCategory(preset.name, preset.colour, preset.icon)}
                        style={{
                          background: exists ? `${preset.colour}22` : '#1c1724',
                          border: `1px solid ${exists ? preset.colour : C.border}`,
                          borderRadius: 8,
                          padding: '6px 12px',
                          fontSize: 12,
                          fontWeight: 500,
                          color: C.text,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
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

              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
                <span style={label}>Icon & Colour</span>

                {/* Icon Row */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                  {EMOJI_OPTIONS.map((ico) => (
                    <button
                      key={ico}
                      type="button"
                      onClick={() => setSelectedIcon(ico)}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 6,
                        border: `1px solid ${selectedIcon === ico ? C.accent : C.border}`,
                        background: selectedIcon === ico ? `${C.accent}33` : '#1c1724',
                        fontSize: 15,
                        cursor: 'pointer',
                      }}
                    >
                      {ico}
                    </button>
                  ))}
                </div>

                {/* Colour Swatches */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                  {SWATCH_OPTIONS.map((sw) => (
                    <button
                      key={sw}
                      type="button"
                      onClick={() => setSelectedColour(sw)}
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        background: sw,
                        border: `2px solid ${selectedColour === sw ? C.text : 'transparent'}`,
                        cursor: 'pointer',
                      }}
                    />
                  ))}
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <input
                    style={{ ...input, flex: 1 }}
                    placeholder="Category name (e.g. Deep Work, Reading, Gym)"
                    value={newName}
                    maxLength={60}
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

          {/* Main Tracked Categories List */}
          <div style={{ ...card, marginBottom: 20 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 14,
              }}
            >
              <div
                style={{
                  fontSize: 12.5,
                  fontWeight: 700,
                  color: C.dim,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                TRACKED CATEGORIES ({projects.length})
              </div>
              <div style={{ fontSize: 11.5, color: C.dim }}>
                ⭐ {primaryCount} of 3 overlay slots used
              </div>
            </div>

            {totals.rows.length === 0 ? (
              <div style={{ fontSize: 13, color: C.faint, padding: '12px 0' }}>
                No categories yet. Click "+ New Category" above to get started!
              </div>
            ) : (
              totals.rows.map(({ project, ms, count }) => {
                const pct = totals.grand > 0 ? (ms / totals.grand) * 100 : 0;
                const primaryIndex = settings?.primaryProjectIds?.indexOf(project.id) ?? -1;
                const isPrimary = primaryIndex !== -1;
                const currentProjectId = timer?.projectId || timer?.session?.projectId || null;
                const isRunningThis = timer?.running === true && currentProjectId === project.id;

                return (
                  <div
                    key={project.id}
                    style={{
                      background: isRunningThis ? `${project.colour}18` : '#181422',
                      border: `1px solid ${isRunningThis ? project.colour : isPrimary ? `${project.colour}55` : C.border}`,
                      borderRadius: 12,
                      padding: '12px 16px',
                      marginBottom: 10,
                      transition: 'all 160ms ease',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 6,
                      }}
                    >
                      {/* Category Name & Indicators */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            background: project.colour,
                            boxShadow: `0 0 8px ${project.colour}`,
                          }}
                        />
                        <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                          {formatCategoryName(project.name)}
                        </span>

                        {isRunningThis && (
                          <span
                            style={{
                              fontSize: 10.5,
                              background: `${project.colour}33`,
                              color: project.colour,
                              border: `1px solid ${project.colour}`,
                              padding: '2px 8px',
                              borderRadius: 999,
                              fontWeight: 700,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <span
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: '50%',
                                background: project.colour,
                              }}
                            />
                            Tracking Active
                          </span>
                        )}
                      </div>

                      {/* Actions & Start/Stop Button */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span
                          style={{ fontSize: 12, color: C.dim, fontVariantNumeric: 'tabular-nums' }}
                        >
                          {humanDuration(ms)} · {count} session{count === 1 ? '' : 's'}
                        </span>

                        {/* Slot order lives here now, next to the category it
                            reorders, rather than in a separate panel. */}
                        {isPrimary && (
                          <div style={{ display: 'flex', gap: 3 }}>
                            <button
                              type="button"
                              title="Move earlier on the overlay"
                              disabled={primaryIndex === 0}
                              onClick={() => void movePrimaryProject(primaryIndex, 'left')}
                              style={slotArrow(primaryIndex === 0)}
                            >
                              ◀
                            </button>
                            <button
                              type="button"
                              title="Move later on the overlay"
                              disabled={primaryIndex === primaryCount - 1}
                              onClick={() => void movePrimaryProject(primaryIndex, 'right')}
                              style={slotArrow(primaryIndex === primaryCount - 1)}
                            >
                              ▶
                            </button>
                          </div>
                        )}

                        <button
                          type="button"
                          // Pinning a fourth used to silently drop whichever
                          // category happened to be in slot 3 -- no warning,
                          // and it vanished from the overlay. Full means full.
                          disabled={!isPrimary && primaryCount >= 3}
                          title={
                            isPrimary
                              ? `Overlay slot ${primaryIndex + 1} — click to unpin`
                              : primaryCount >= 3
                                ? 'All 3 overlay slots are used. Unpin one first.'
                                : 'Pin to Mochi’s overlay'
                          }
                          onClick={() => void togglePrimaryProject(project.id)}
                          style={{
                            background: 'transparent',
                            border: `1px solid ${isPrimary ? project.colour : C.border}`,
                            color: isPrimary ? C.text : primaryCount >= 3 ? C.faint : C.dim,
                            borderRadius: 6,
                            padding: '4px 8px',
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: !isPrimary && primaryCount >= 3 ? 'not-allowed' : 'pointer',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {isPrimary ? `★ Slot ${primaryIndex + 1}` : '☆ Pin'}
                        </button>

                        {/* Start / Stop Tracking Button */}
                        <button
                          type="button"
                          onClick={() => void startOrStopSession(project.id)}
                          style={{
                            background: isRunningThis
                              ? 'linear-gradient(135deg, #ff5e7e, #e63956)'
                              : `${project.colour}22`,
                            border: `1px solid ${isRunningThis ? '#e63956' : project.colour}`,
                            color: isRunningThis ? '#ffffff' : C.text,
                            borderRadius: 6,
                            padding: '5px 14px',
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 5,
                            boxShadow: isRunningThis ? '0 2px 8px rgba(230, 57, 86, 0.35)' : 'none',
                          }}
                        >
                          <span>{isRunningThis ? '⏹ Stop' : '▶ Track'}</span>
                        </button>

                        {project.name !== 'General' &&
                          (confirmArchive === project.id ? (
                            // One click used to archive a category and every
                            // session behind it, with nothing to undo it.
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 11.5, color: C.warn, fontWeight: 600 }}>
                                Remove?
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setConfirmArchive(null);
                                  void archiveCategory(project.id);
                                }}
                                style={{
                                  ...button('ghost'),
                                  padding: '3px 9px',
                                  fontSize: 11.5,
                                  color: C.warn,
                                  borderColor: C.warn,
                                }}
                              >
                                Remove
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmArchive(null)}
                                style={{ ...button('ghost'), padding: '3px 9px', fontSize: 11.5 }}
                              >
                                Cancel
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmArchive(project.id)}
                              title={`Remove ${formatCategoryName(project.name)}`}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: C.dim,
                                cursor: 'pointer',
                                fontSize: 13,
                                padding: '2px 4px',
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.color = C.warn)}
                              onMouseLeave={(e) => (e.currentTarget.style.color = C.dim)}
                            >
                              🗑️
                            </button>
                          ))}
                      </div>
                    </div>

                    {/* Share of tracked time. The bar drew this already but
                        never said what it measured, so a full bar and a sliver
                        were equally unexplained. */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div
                        style={{
                          flex: 1,
                          height: 5,
                          borderRadius: 3,
                          background: '#262033',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{ width: `${pct}%`, height: '100%', background: project.colour }}
                        />
                      </div>
                      <span
                        style={{
                          fontSize: 11,
                          color: C.faint,
                          fontVariantNumeric: 'tabular-nums',
                          minWidth: 62,
                          textAlign: 'right',
                        }}
                      >
                        {pct < 1 && pct > 0 ? '<1' : Math.round(pct)}% of time
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : subTab === 'performance' ? (
        /* Dedicated Performance & Reports Analytics Sub-Tab */
        <div>
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
              style={{
                display: 'flex',
                gap: 4,
                background: '#181422',
                padding: 3,
                borderRadius: 8,
                border: `1px solid ${C.border}`,
              }}
            >
              {(
                [
                  { id: 'today', label: 'Today' },
                  { id: '7days', label: 'Last 7 Days' },
                  { id: '30days', label: 'Last 30 Days' },
                  { id: 'all', label: 'All Time' },
                ] as const
              ).map((filter) => {
                const active = dateRange === filter.id;
                return (
                  <button
                    key={filter.id}
                    type="button"
                    onClick={() => setDateRange(filter.id)}
                    style={{
                      background: active ? 'rgba(242, 166, 179, 0.18)' : 'transparent',
                      color: active ? C.accent : C.dim,
                      border: active ? `1px solid ${C.accent}66` : '1px solid transparent',
                      borderRadius: 6,
                      padding: '4px 10px',
                      fontSize: 11.5,
                      fontWeight: active ? 700 : 500,
                      cursor: 'pointer',
                      transition: 'all 120ms ease',
                    }}
                  >
                    {filter.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* KPI Stat Cards Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 14,
              marginBottom: 20,
            }}
          >
            {/* Total Focus Time */}
            <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: C.dim,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                ⏱️ Total Focus Time
              </div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: C.text,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {humanDuration(performanceStats.totalMs)}
              </div>
            </div>

            {/* Total Sessions */}
            <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: C.dim,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                🎯 Focus Sessions
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: C.text }}>
                {performanceStats.sessionCount}{' '}
                {performanceStats.sessionCount === 1 ? 'session' : 'sessions'}
              </div>
            </div>

            {/* Avg Session Length */}
            <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: C.dim,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                ⚡ Avg Session Length
              </div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: C.text,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {humanDuration(performanceStats.avgSessionMs)}
              </div>
            </div>

            {/* Peak Focus Window */}
            <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: C.dim,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                🧠 Peak Focus Window
              </div>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 750,
                  color: C.accent,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {performanceStats.peakPeriod}
              </div>
            </div>
          </div>

          {/* SVG Donut Pie Chart & Smart User Insights Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: 16,
              marginBottom: 20,
            }}
          >
            {/* SVG Donut Pie Chart Card */}
            <div style={card}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: C.dim,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  marginBottom: 16,
                }}
              >
                🎨 Category Time Breakdown (Pie Chart)
              </div>

              {performanceStats.categoryBreakdown.length === 0 ? (
                <div
                  style={{ fontSize: 13, color: C.faint, padding: '24px 0', textAlign: 'center' }}
                >
                  No sessions recorded for this timeframe to render chart.
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
                  {/* SVG Donut Ring */}
                  <div style={{ position: 'relative', width: 140, height: 140, flexShrink: 0 }}>
                    <svg
                      width="140"
                      height="140"
                      viewBox="0 0 140 140"
                      style={{ transform: 'rotate(-90deg)' }}
                    >
                      {(() => {
                        const radius = 50;
                        const circumference = 2 * Math.PI * radius; // ~314.15
                        let accumPct = 0;

                        return performanceStats.categoryBreakdown.map((item) => {
                          const strokeDash = (item.pct / 100) * circumference;
                          const strokeOffset = -(accumPct / 100) * circumference;
                          accumPct += item.pct;

                          return (
                            <circle
                              key={item.project.id}
                              cx="70"
                              cy="70"
                              r={radius}
                              fill="transparent"
                              stroke={item.project.colour}
                              strokeWidth="20"
                              strokeDasharray={`${strokeDash} ${circumference}`}
                              strokeDashoffset={strokeOffset}
                              style={{ transition: 'all 300ms ease' }}
                            />
                          );
                        });
                      })()}
                    </svg>
                    {/* Donut Hole Text */}
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center',
                      }}
                    >
                      <span style={{ fontSize: 14, fontWeight: 800, color: C.text }}>
                        {performanceStats.categoryBreakdown.length}
                      </span>
                      <span style={{ fontSize: 9.5, color: C.dim, textTransform: 'uppercase' }}>
                        Categories
                      </span>
                    </div>
                  </div>

                  {/* Donut Legend Items */}
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      flex: 1,
                      minWidth: 140,
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span
                            style={{
                              width: 9,
                              height: 9,
                              borderRadius: '50%',
                              background: item.project.colour,
                              boxShadow: `0 0 6px ${item.project.colour}`,
                            }}
                          />
                          <span
                            style={{
                              color: C.text,
                              fontWeight: 650,
                              maxWidth: 100,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {formatCategoryName(item.project.name)}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span
                            style={{
                              color: item.project.colour,
                              fontWeight: 750,
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {item.pct.toFixed(1)}%
                          </span>
                          <span
                            style={{
                              color: C.dim,
                              fontSize: 11,
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            ({humanDuration(item.ms)})
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Smart Focus Insights & Ratio Card */}
            <div
              style={{
                ...card,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: C.dim,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    marginBottom: 14,
                  }}
                >
                  🧠 Productivity & Focus Insights
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {/* Focus Ratio Indicator */}
                  <div
                    style={{
                      background: '#181422',
                      border: `1px solid ${C.border}`,
                      borderRadius: 10,
                      padding: '12px 14px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 6,
                      }}
                    >
                      <span style={{ fontSize: 12.5, fontWeight: 650, color: C.text }}>
                        🎯 Deep Work Focus Ratio
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 800, color: C.accent }}>
                        {performanceStats.focusRatioPct}%
                      </span>
                    </div>
                    <div
                      style={{
                        height: 6,
                        borderRadius: 3,
                        background: '#262033',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${performanceStats.focusRatioPct}%`,
                          height: '100%',
                          background: C.accent,
                          borderRadius: 3,
                        }}
                      />
                    </div>
                  </div>

                  {/* Smart Tip */}
                  <div
                    style={{
                      background: 'rgba(242, 166, 179, 0.1)',
                      border: `1px solid ${C.accent}44`,
                      borderRadius: 10,
                      padding: '12px 14px',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
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
                        ? `You perform strongest in "${performanceStats.topCategory.project.name}", your average session length is ${humanDuration(performanceStats.avgSessionMs)}, keeping you in a prime focus flow`
                        : 'Track a session to unlock personalized Mochi focus recommendations'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Detailed Category Performance Table */}
          <div style={card}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: C.dim,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                marginBottom: 14,
              }}
            >
              Category Performance Table ({performanceStats.categoryBreakdown.length})
            </div>

            {performanceStats.categoryBreakdown.length === 0 ? (
              <div style={{ fontSize: 13, color: C.faint, padding: '16px 0', textAlign: 'center' }}>
                No focus activity logged for this time range. Select another date filter above!
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {performanceStats.categoryBreakdown.map((item) => (
                  <div
                    key={item.project.id}
                    style={{
                      background: '#181422',
                      border: `1px solid ${C.border}`,
                      borderRadius: 10,
                      padding: '12px 14px',
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            background: item.project.colour,
                            boxShadow: `0 0 6px ${item.project.colour}`,
                          }}
                        />
                        <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                          {formatCategoryName(item.project.name)}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
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
                    {/* Individual progress bar */}
                    <div
                      style={{
                        height: 4,
                        borderRadius: 2,
                        background: '#262033',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${item.pct}%`,
                          height: '100%',
                          background: item.project.colour,
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
        <div style={card}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 16,
            }}
          >
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text }}>
                🕒 Session History Log
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: C.dim }}>
                {sessions.length} total focus sessions tracked.
              </p>
            </div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: C.accent,
                background: `${C.accent}22`,
                padding: '4px 12px',
                borderRadius: 8,
              }}
            >
              {humanDuration(totals.grand)} Total Focus
            </div>
          </div>

          {sessions.length === 0 ? (
            <div style={{ fontSize: 13, color: C.faint, padding: '24px 0', textAlign: 'center' }}>
              No recorded sessions yet. Start tracking time to build your history log!
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sessions.map((s) => {
                const p = projects.find((x) => x.id === s.projectId);
                const color = p?.colour ?? C.accent;
                const name = p?.name ?? 'General Focus';
                const dateStr = new Date(s.startedAt).toLocaleString(undefined, {
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
                      background: '#181422',
                      border: `1px solid ${C.border}`,
                      borderRadius: 10,
                      padding: '10px 14px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: color,
                          boxShadow: `0 0 6px ${color}`,
                        }}
                      />
                      <span style={{ fontSize: 13.5, fontWeight: 650, color: C.text }}>{name}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      <span style={{ fontSize: 12, color: C.dim }}>{dateStr}</span>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: s.endedAt === null ? C.accent : C.text,
                          fontVariantNumeric: 'tabular-nums',
                          background: 'rgba(255, 255, 255, 0.04)',
                          padding: '3px 10px',
                          borderRadius: 6,
                        }}
                      >
                        {dur}
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
