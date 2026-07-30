import { useCallback, useEffect, useMemo, useState, type JSX } from 'react';
import { elapsedMs, formatDuration, type MochiSettings, type Project, type TimerSnapshot, type WorkSession } from '@mochi/core';
import { button, C, card, h2, humanDuration, input, label, sub } from '../ui.js';

const QUICK_PRESETS = [
  { name: 'Work Time', colour: '#6366f1', icon: '💼' },
  { name: 'Personal Time', colour: '#ec4899', icon: '👤' },
  { name: 'Study & Research', colour: '#10b981', icon: '📚' },
  { name: 'Creative Focus', colour: '#f59e0b', icon: '🎨' },
  { name: 'Rest & Wellness', colour: '#8b5cf6', icon: '🧘' },
  { name: 'Side Project', colour: '#3b82f6', icon: '⚡' },
];

const EMOJI_OPTIONS = ['💼', '👤', '📚', '🎨', '🧘', '💻', '☕', '⚡', '🏋️', '🎧', '📝', '🎯', '🚀', '🛠️'];
const SWATCH_OPTIONS = ['#6366f1', '#ec4899', '#10b981', '#f59e0b', '#8b5cf6', '#3b82f6', '#F2A6B3', '#A6D6F2'];

export function TimeTab(): JSX.Element {
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
    if (setObj.primaryProjectIds.length === 0 && pList.length > 0) {
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
      const current = [...settings.primaryProjectIds];
      let updated: string[];

      if (current.includes(projectId)) {
        updated = current.filter((id) => id !== projectId);
      } else {
        if (current.length >= 3) {
          updated = [current[0]!, current[1]!, projectId].filter(Boolean);
        } else {
          updated = [...current, projectId];
        }
      }

      const nextSettings = await window.mochi.settings.setPrimaryProjects(updated);
      setSettings(nextSettings);
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

  const stopCurrentSession = useCallback(async () => {
    const next = await window.mochi.timer.stop();
    setTimer(next);
    await reload();
  }, [reload]);

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

      if (existing) {
        if (settings && !settings.primaryProjectIds.includes(existing.id) && settings.primaryProjectIds.length < 3) {
          void window.mochi.settings.setPrimaryProjects([...settings.primaryProjectIds, existing.id]);
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

        if (settings && settings.primaryProjectIds.length < 3) {
          void window.mochi.settings.setPrimaryProjects([...settings.primaryProjectIds, created.id]);
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
      if (settings && settings.primaryProjectIds.includes(projectId)) {
        const updatedPrimary = settings.primaryProjectIds.filter((id) => id !== projectId);
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

  const activeProject = useMemo(() => {
    if (!timer?.running) return null;
    const currentId = timer.projectId || timer.session?.projectId || null;
    return projects.find((p) => p.id === currentId) ?? null;
  }, [timer, projects]);

  const primaryCount = settings?.primaryProjectIds.length ?? 0;

  return (
    <div>
      {/* Header Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={h2}>Time & Categories</h2>
          <p style={sub}>
            {sessions.length} session{sessions.length === 1 ? '' : 's'} · {humanDuration(totals.grand)} total focus tracked. Pin up to 3 categories to float on Mochi!
          </p>
        </div>
        <button
          style={button(showCreateForm ? 'ghost' : 'primary')}
          onClick={() => setShowCreateForm(!showCreateForm)}
        >
          {showCreateForm ? 'Cancel' : '+ New Category'}
        </button>
      </div>

      {/* LIVE ACTIVE SESSION BAR (If session is running) */}
      {timer?.running && activeProject && (
        <div
          style={{
            background: `linear-gradient(135deg, ${activeProject.colour}22, rgba(25, 20, 32, 0.95))`,
            border: `2px solid ${activeProject.colour}`,
            boxShadow: `0 0 16px ${activeProject.colour}44`,
            borderRadius: 14,
            padding: '16px 20px',
            marginBottom: 20,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: activeProject.colour,
                boxShadow: `0 0 12px ${activeProject.colour}`,
              }}
            />
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.accent, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                🟢 CURRENTLY TRACKING SESSION
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginTop: 2 }}>
                {activeProject.name}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ fontVariantNumeric: 'tabular-nums', fontSize: 20, fontWeight: 700, color: C.accent }}>
              {formatDuration(timer.elapsedMs)}
            </div>
            <button
              onClick={() => void stopCurrentSession()}
              style={{
                background: C.warn,
                color: '#ffffff',
                border: 'none',
                borderRadius: 8,
                padding: '8px 16px',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              }}
            >
              <span>⏹</span>
              <span>Stop Session</span>
            </button>
          </div>
        </div>
      )}

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
                const exists = projects.some((p) => p.name.toLowerCase().includes(preset.name.toLowerCase()));
                return (
                  <button
                    key={preset.name}
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            TRACKED CATEGORIES ({projects.length})
          </div>
          <div style={{ fontSize: 11.5, color: C.dim }}>
            ⭐ {primaryCount} / 3 Mascot Quick-Trackers Pinned
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
                    <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{project.name}</span>
                    
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
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: project.colour }} />
                        Tracking Active
                      </span>
                    )}
                  </div>

                  {/* Actions & Start/Stop Button */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 12, color: C.dim, fontVariantNumeric: 'tabular-nums' }}>
                      {humanDuration(ms)} · {count} session{count === 1 ? '' : 's'}
                    </span>

                    {/* Mascot Quick-Track Pin & Reorder Controls */}
                    {isPrimary ? (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          background: 'rgba(0, 0, 0, 0.25)',
                          border: `1px solid ${project.colour}66`,
                          borderRadius: 8,
                          padding: '2px 6px',
                        }}
                      >
                        <span style={{ fontSize: 11, fontWeight: 700, color: project.colour, marginRight: 2 }}>
                          ★ Slot #{primaryIndex + 1}
                        </span>
                        <button
                          title="Move Left on Mascot"
                          disabled={primaryIndex === 0}
                          onClick={() => void movePrimaryProject(primaryIndex, 'left')}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: primaryIndex === 0 ? C.faint : C.text,
                            cursor: primaryIndex === 0 ? 'not-allowed' : 'pointer',
                            fontSize: 10,
                            padding: '1px 3px',
                          }}
                        >
                          ◀
                        </button>
                        <button
                          title="Move Right on Mascot"
                          disabled={primaryIndex === (settings?.primaryProjectIds?.length ?? 0) - 1}
                          onClick={() => void movePrimaryProject(primaryIndex, 'right')}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: primaryIndex === (settings?.primaryProjectIds?.length ?? 0) - 1 ? C.faint : C.text,
                            cursor: primaryIndex === (settings?.primaryProjectIds?.length ?? 0) - 1 ? 'not-allowed' : 'pointer',
                            fontSize: 10,
                            padding: '1px 3px',
                          }}
                        >
                          ▶
                        </button>
                        <button
                          title="Unpin from Mascot"
                          onClick={() => void togglePrimaryProject(project.id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: C.dim,
                            cursor: 'pointer',
                            fontSize: 11,
                            padding: '1px 3px',
                            marginLeft: 2,
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => void togglePrimaryProject(project.id)}
                        disabled={primaryCount >= 3}
                        title={primaryCount >= 3 ? '3 slots already pinned. Unpin one to pin this.' : 'Pin to Mascot Overlay'}
                        style={{
                          background: 'transparent',
                          border: `1px solid ${C.border}`,
                          color: primaryCount >= 3 ? C.faint : C.dim,
                          borderRadius: 6,
                          padding: '4px 8px',
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: primaryCount >= 3 ? 'not-allowed' : 'pointer',
                        }}
                      >
                        ☆ Pin to Mascot
                      </button>
                    )}

                    {/* Start / Stop Tracking Button */}
                    <button
                      onClick={() => void startOrStopSession(project.id)}
                      style={{
                        background: isRunningThis ? 'linear-gradient(135deg, #ff5e7e, #e63956)' : `${project.colour}22`,
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

                    {project.name !== 'General' && (
                      <button
                        onClick={() => void archiveCategory(project.id)}
                        title="Delete category"
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
                    )}
                  </div>
                </div>

                {/* Progress Bar */}
                <div style={{ height: 5, borderRadius: 3, background: '#262033', overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: project.colour }} />
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* History Card */}
      <div style={{ ...card, maxHeight: 240, overflowY: 'auto' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.dim, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          SESSION HISTORY ({sessions.length})
        </div>
        {sessions.length === 0 ? (
          <div style={{ fontSize: 13, color: C.faint, padding: '8px 0' }}>Nothing tracked yet.</div>
        ) : (
          sessions.map((s) => {
            const p = projects.find((x) => x.id === s.projectId);
            return (
              <div
                key={s.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '8px 0',
                  borderTop: `1px solid ${C.border}`,
                  fontSize: 12.5,
                }}
              >
                <span style={{ color: C.dim }}>
                  {new Date(s.startedAt).toLocaleString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                <span style={{ fontWeight: 500, color: C.text }}>{p?.name ?? 'General'}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums', color: C.accent, fontWeight: 600 }}>
                  {humanDuration(elapsedMs(s, Date.now()))}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
