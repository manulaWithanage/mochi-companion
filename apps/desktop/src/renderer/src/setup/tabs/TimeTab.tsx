import { useCallback, useEffect, useMemo, useState, type JSX } from 'react';
import { elapsedMs, type Project, type WorkSession } from '@mochi/core';
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
  const [newName, setNewName] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('💼');
  const [selectedColour, setSelectedColour] = useState('#6366f1');
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setSessions(await window.mochi.timer.listSessions());
    setProjects(await window.mochi.projects.list());
  }, []);

  useEffect(() => {
    void reload();
    return window.mochi.timer.onChange((s) => {
      if (!s.running) void reload();
    });
  }, [reload]);

  const createProject = useCallback(
    async (nameOverride?: string, colourOverride?: string, iconOverride?: string) => {
      const name = (nameOverride || newName).trim();
      if (name.length === 0) return;
      setBusy(true);
      try {
        const icon = iconOverride || selectedIcon;
        const displayName = `${icon} ${name}`;
        const colour = colourOverride || selectedColour;
        await window.mochi.projects.create(displayName, colour);
        setNewName('');
        await reload();
      } finally {
        setBusy(false);
      }
    },
    [newName, selectedIcon, selectedColour, reload],
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

  return (
    <div>
      <h2 style={h2}>Time & Categories</h2>
      <p style={sub}>
        {sessions.length} session{sessions.length === 1 ? '' : 's'} · {humanDuration(totals.grand)}{' '}
        tracked across categories.
      </p>

      {/* Quick Add Preset Categories */}
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.dim, marginBottom: 10 }}>
          ⚡ QUICK CATEGORIES
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
          {CATEGORY_PRESETS.map((preset) => (
            <button
              key={preset.name}
              disabled={busy}
              onClick={() => void createProject(preset.name, preset.colour, preset.icon)}
              style={{
                background: '#191522',
                border: `1px solid ${C.border}`,
                borderRadius: 10,
                padding: '10px 12px',
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'all 160ms ease',
                color: C.text,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = preset.colour)}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = C.border)}
            >
              <div style={{ fontSize: 18, marginBottom: 4 }}>{preset.icon}</div>
              <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {preset.name}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Project Totals & Custom Category Creator */}
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.dim, marginBottom: 12 }}>
          TRACKED CATEGORIES
        </div>
        {totals.rows.length === 0 && (
          <div style={{ fontSize: 13, color: C.faint, marginBottom: 14 }}>
            No category projects yet. Click a quick category above or add a custom one below!
          </div>
        )}
        {totals.rows.map(({ project, ms, count }) => {
          const pct = totals.grand > 0 ? (ms / totals.grand) * 100 : 0;
          return (
            <div key={project.id} style={{ marginBottom: 12 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
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
                <span style={{ color: C.dim, fontVariantNumeric: 'tabular-nums' }}>
                  {humanDuration(ms)} · {count} session{count === 1 ? '' : 's'}
                </span>
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
