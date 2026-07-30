import { useCallback, useEffect, useMemo, useState, type JSX } from 'react';
import { elapsedMs, type MochiSettings, type Project, type WorkSession } from '@mochi/core';
import { button, C, card, h2, humanDuration, input, label, sub } from '../ui.js';

const CATEGORY_PRESETS = [
  { name: 'Work Time', colour: '#6366f1', icon: '💼' },
  { name: 'Personal Time', colour: '#ec4899', icon: '👤' },
  { name: 'Study & Research', colour: '#10b981', icon: '📚' },
  { name: 'Creative Focus', colour: '#f59e0b', icon: '🎨' },
  { name: 'Rest & Wellness', colour: '#8b5cf6', icon: '🧘' },
  { name: 'Side Project', colour: '#3b82f6', icon: '⚡' },
];

const ICON_OPTIONS = ['💼', '👤', '📚', '🎨', '🧘', '💻', '☕', '⚡', '🏋️', '🎧', '📝', '🎯', '🚀', '🛠️'];
const SWATCHES = ['#6366f1', '#ec4899', '#10b981', '#f59e0b', '#8b5cf6', '#3b82f6', '#F2A6B3', '#A6D6F2'];

export function TimeTab(): JSX.Element {
  const [sessions, setSessions] = useState<readonly WorkSession[]>([]);
  const [projects, setProjects] = useState<readonly Project[]>([]);
  const [settings, setSettings] = useState<MochiSettings | null>(null);
  const [newName, setNewName] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('💼');
  const [selectedColour, setSelectedColour] = useState('#6366f1');
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const sList = await window.mochi.timer.listSessions();
    const pList = await window.mochi.projects.list();
    const setObj = await window.mochi.settings.get();

    setSessions(sList);
    setProjects(pList);
    setSettings(setObj);

    // Auto-seed top 3 unique projects as primary if none selected yet
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

  const createProject = useCallback(
    async (nameOverride?: string, colourOverride?: string, iconOverride?: string) => {
      const targetName = (nameOverride || newName).trim();
      if (targetName.length === 0) return;

      const icon = iconOverride || selectedIcon;
      const fullDisplayName = `${icon} ${targetName}`;

      // DEDUPLICATION CHECK: Check if project with this name already exists
      const existing = projects.find(
        (p) =>
          p.name.toLowerCase() === fullDisplayName.toLowerCase() ||
          p.name.toLowerCase() === targetName.toLowerCase() ||
          p.name.toLowerCase().endsWith(targetName.toLowerCase()),
      );

      if (existing) {
        // Project already exists, don't duplicate! Auto-set as primary if slot available.
        if (settings && !settings.primaryProjectIds.includes(existing.id) && settings.primaryProjectIds.length < 3) {
          void window.mochi.settings.setPrimaryProjects([...settings.primaryProjectIds, existing.id]);
        }
        setNewName('');
        return;
      }

      setBusy(true);
      try {
        const colour = colourOverride || selectedColour;
        const created = await window.mochi.projects.create(fullDisplayName, colour);
        setNewName('');

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
      // Remove from primary list if present
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

  const primaryProjects = useMemo(() => {
    if (settings === null) return [];
    return settings.primaryProjectIds
      .map((id) => projects.find((p) => p.id === id))
      .filter((p): p is Project => p !== undefined);
  }, [settings, projects]);

  return (
    <div>
      <h2 style={h2}>Time & Categories</h2>
      <p style={sub}>
        {sessions.length} session{sessions.length === 1 ? '' : 's'} · {humanDuration(totals.grand)}{' '}
        tracked across categories.
      </p>

      {/* 3 Main Primary Quick-Tracker Display Banner */}
      <div style={{ ...card, marginBottom: 16, border: `1px solid ${C.accent}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
              ⭐ 3 Primary Category Quick-Trackers (Floating on Mochi)
            </div>
            <div style={{ fontSize: 11.5, color: C.dim, marginTop: 2 }}>
              These 3 icons pop out at the bottom when you click Mochi. Click any icon to switch categories!
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {[0, 1, 2].map((idx) => {
            const proj = primaryProjects[idx];
            return (
              <div
                key={idx}
                style={{
                  background: '#1c1724',
                  border: `1px dashed ${proj ? proj.colour : C.border}`,
                  borderRadius: 10,
                  padding: '12px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                {proj ? (
                  <>
                    <div
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 8,
                        background: `${proj.colour}22`,
                        border: `1px solid ${proj.colour}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 16,
                      }}
                    >
                      {proj.name.slice(0, 2)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 12.5,
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          color: C.text,
                        }}
                      >
                        {proj.name}
                      </div>
                      <div style={{ fontSize: 10.5, color: C.accent }}>Slot #{idx + 1} Active</div>
                    </div>
                    <button
                      onClick={() => void togglePrimaryProject(proj.id)}
                      title="Remove from primary slot"
                      style={{
                        background: 'none',
                        border: 'none',
                        color: C.warn,
                        cursor: 'pointer',
                        fontSize: 14,
                      }}
                    >
                      ×
                    </button>
                  </>
                ) : (
                  <div style={{ fontSize: 12, color: C.faint, fontStyle: 'italic', textAlign: 'center', width: '100%' }}>
                    + Slot #{idx + 1} Empty
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Quick Add Preset Categories */}
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.dim, marginBottom: 10 }}>
          ⚡ QUICK CATEGORY PRESETS
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
          {CATEGORY_PRESETS.map((preset) => {
            const alreadyExists = projects.some((p) => p.name.toLowerCase().includes(preset.name.toLowerCase()));

            return (
              <button
                key={preset.name}
                disabled={busy}
                onClick={() => void createProject(preset.name, preset.colour, preset.icon)}
                style={{
                  background: '#191522',
                  border: `1px solid ${alreadyExists ? preset.colour : C.border}`,
                  borderRadius: 10,
                  padding: '10px 12px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 160ms ease',
                  color: C.text,
                  position: 'relative',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = preset.colour)}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = alreadyExists ? preset.colour : C.border)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 18 }}>{preset.icon}</span>
                  {alreadyExists && <span style={{ fontSize: 10, color: C.accent, fontWeight: 600 }}>Active</span>}
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {preset.name}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Project Totals & Custom Category Creator */}
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.dim, marginBottom: 12 }}>
          TRACKED CATEGORIES ({projects.length})
        </div>
        {totals.rows.length === 0 && (
          <div style={{ fontSize: 13, color: C.faint, marginBottom: 14 }}>
            No category projects yet. Click a quick category above or add a custom one below!
          </div>
        )}
        {totals.rows.map(({ project, ms, count }) => {
          const pct = totals.grand > 0 ? (ms / totals.grand) * 100 : 0;
          const isPrimary = settings?.primaryProjectIds.includes(project.id) === true;

          return (
            <div key={project.id} style={{ marginBottom: 12 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: 13,
                  marginBottom: 5,
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{
                      width: 9,
                      height: 9,
                      borderRadius: 3,
                      background: project.colour,
                      display: 'inline-block',
                    }}
                  />
                  <span style={{ fontWeight: 600 }}>{project.name}</span>
                </span>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: C.dim, fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>
                    {humanDuration(ms)} · {count} session{count === 1 ? '' : 's'}
                  </span>

                  <button
                    onClick={() => void togglePrimaryProject(project.id)}
                    style={{
                      ...button(isPrimary ? 'primary' : 'ghost'),
                      padding: '3px 8px',
                      fontSize: 11,
                    }}
                  >
                    {isPrimary ? '★ Primary' : '☆ Set Primary'}
                  </button>

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
                </div>
              </div>

              <div
                style={{ height: 6, borderRadius: 3, background: '#332c3d', overflow: 'hidden' }}
              >
                <div style={{ width: `${pct}%`, height: '100%', background: project.colour }} />
              </div>
            </div>
          );
        })}

        {/* Custom Category Form */}
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
          <span style={label}>Add Custom Category</span>
          
          {/* Icon Selector */}
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 10 }}>
            {ICON_OPTIONS.map((ico) => (
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
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {ico}
              </button>
            ))}
          </div>

          {/* Color Swatch Picker */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            {SWATCHES.map((sw) => (
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

          <div style={{ display: 'flex', gap: 8 }}>
            <input
              style={{ ...input, flex: 1 }}
              placeholder="Custom Category Name (e.g. Deep Coding, Reading)"
              value={newName}
              maxLength={60}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void createProject();
              }}
            />
            <button
              style={{ ...button('primary'), whiteSpace: 'nowrap' }}
              disabled={busy || newName.trim().length === 0}
              onClick={() => void createProject()}
            >
              + Add Category
            </button>
          </div>
        </div>
      </div>

      {/* History */}
      <div style={{ ...card, maxHeight: 220, overflowY: 'auto' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.dim, marginBottom: 10 }}>HISTORY</div>
        {sessions.length === 0 ? (
          <div style={{ fontSize: 13, color: C.faint }}>Nothing tracked yet.</div>
        ) : (
          sessions.map((s) => {
            const p = projects.find((x) => x.id === s.projectId);
            return (
              <div
                key={s.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '6px 0',
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
                <span style={{ fontWeight: 500 }}>{p?.name ?? 'General'}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums', color: C.accent }}>
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
