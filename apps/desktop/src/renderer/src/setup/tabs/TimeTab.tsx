import { useCallback, useEffect, useMemo, useState, type JSX } from 'react';
import { elapsedMs, type MochiSettings, type Project, type WorkSession } from '@mochi/core';
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

    setSessions(sList);
    setProjects(pList);
    setSettings(setObj);

    // Auto-seed top 3 unique projects as primary if none set
    if (setObj.primaryProjectIds.length === 0 && pList.length > 0) {
      const defaultPrimary = pList.slice(0, 3).map((p) => p.id);
      void window.mochi.settings.setPrimaryProjects(defaultPrimary);
    }
  }, []);

  useEffect(() => {
    void reload();
    const offTimer = window.mochi.timer.onChange((s) => {
      if (!s.running) void reload();
    });
    const offSettings = window.mochi.settings.onChange(setSettings);
    return () => {
      offTimer();
      offSettings();
    };
  }, [reload]);

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

  const createCategory = useCallback(
    async (nameOverride?: string, colourOverride?: string, iconOverride?: string) => {
      const rawName = (nameOverride || newName).trim();
      if (rawName.length === 0) return;

      const icon = iconOverride || selectedIcon;
      const fullDisplayName = `${icon} ${rawName}`;

      // Deduplication check
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

  const primaryCount = settings?.primaryProjectIds.length ?? 0;

  return (
    <div>
      {/* Header Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <h2 style={h2}>Time & Categories</h2>
          <p style={sub}>
            {sessions.length} session{sessions.length === 1 ? '' : 's'} · {humanDuration(totals.grand)} total focus tracked.
          </p>
        </div>
        <button
          style={button(showCreateForm ? 'ghost' : 'primary')}
          onClick={() => setShowCreateForm(!showCreateForm)}
        >
          {showCreateForm ? 'Cancel' : '+ New Category'}
        </button>
      </div>

      {/* Floating Mascot Badges Banner */}
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(35, 27, 48, 0.9), rgba(22, 17, 30, 0.9))',
          border: `1px solid ${C.accent}`,
          borderRadius: 14,
          padding: '14px 18px',
          marginBottom: 20,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
        }}
      >
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>⭐ Mascot Quick-Track Icons</span>
            <span style={{ fontSize: 11, background: `${C.accent}33`, color: C.accent, padding: '2px 8px', borderRadius: 999 }}>
              {primaryCount} / 3 Active
            </span>
          </div>
          <div style={{ fontSize: 12, color: C.dim, marginTop: 4 }}>
            Click the star <strong>★</strong> on any category below to float its icon directly above Mochi on your desktop!
          </div>
        </div>

        {/* Selected Primary Pills Preview */}
        <div style={{ display: 'flex', gap: 8 }}>
          {settings?.primaryProjectIds.map((id) => {
            const p = projects.find((x) => x.id === id);
            if (!p) return null;
            return (
              <div
                key={id}
                style={{
                  background: `${p.colour}22`,
                  border: `1px solid ${p.colour}`,
                  borderRadius: 999,
                  padding: '4px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  color: C.text,
                }}
              >
                <span>{p.name.slice(0, 2)}</span>
                <span style={{ maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.name.slice(2).trim()}
                </span>
                <button
                  onClick={() => void togglePrimaryProject(p.id)}
                  style={{ background: 'none', border: 'none', color: C.dim, cursor: 'pointer', fontSize: 12 }}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
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
        <div style={{ fontSize: 12.5, fontWeight: 600, color: C.dim, marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          TRACKED CATEGORIES ({projects.length})
        </div>

        {totals.rows.length === 0 ? (
          <div style={{ fontSize: 13, color: C.faint, padding: '12px 0' }}>
            No categories yet. Click "+ New Category" above to get started!
          </div>
        ) : (
          totals.rows.map(({ project, ms, count }) => {
            const pct = totals.grand > 0 ? (ms / totals.grand) * 100 : 0;
            const isPrimary = settings?.primaryProjectIds.includes(project.id) === true;

            return (
              <div
                key={project.id}
                style={{
                  background: '#181422',
                  border: `1px solid ${isPrimary ? `${project.colour}66` : C.border}`,
                  borderRadius: 10,
                  padding: '12px 14px',
                  marginBottom: 10,
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
                  {/* Category Name & Indicator */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 3,
                        background: project.colour,
                      }}
                    />
                    <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{project.name}</span>
                    {isPrimary && (
                      <span
                        style={{
                          fontSize: 10.5,
                          background: `${project.colour}33`,
                          color: project.colour,
                          padding: '1px 7px',
                          borderRadius: 999,
                          fontWeight: 600,
                        }}
                      >
                        Floating on Mochi
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 12, color: C.dim, fontVariantNumeric: 'tabular-nums' }}>
                      {humanDuration(ms)} · {count} session{count === 1 ? '' : 's'}
                    </span>

                    <button
                      onClick={() => void togglePrimaryProject(project.id)}
                      style={{
                        background: isPrimary ? `${project.colour}33` : 'transparent',
                        border: `1px solid ${isPrimary ? project.colour : C.border}`,
                        color: isPrimary ? C.text : C.dim,
                        borderRadius: 6,
                        padding: '4px 10px',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <span>{isPrimary ? '★' : '☆'}</span>
                      <span>{isPrimary ? 'Pinned' : 'Pin to Mochi'}</span>
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
                          fontSize: 14,
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
