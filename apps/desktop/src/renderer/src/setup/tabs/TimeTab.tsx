import { useCallback, useEffect, useMemo, useState, type JSX } from 'react';
import { elapsedMs, type Project, type WorkSession } from '@mochi/core';
import { button, C, card, h2, humanDuration, input, sub } from '../ui.js';

/**
 * Where the tracked time actually lives: per-project totals and full history.
 *
 * All of it is computed from the local SQLite rows already being written by
 * the stopwatch — no new storage, no sync, nothing leaves the machine.
 */

const SWATCHES = ['#F2A6B3', '#A6D6F2', '#B8E6C0', '#E6D4A6', '#C9B3F2', '#F2C4A6'];

export function TimeTab(): JSX.Element {
  const [sessions, setSessions] = useState<readonly WorkSession[]>([]);
  const [projects, setProjects] = useState<readonly Project[]>([]);
  const [newName, setNewName] = useState('');
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

  const createProject = useCallback(async () => {
    const name = newName.trim();
    if (name.length === 0) return;
    setBusy(true);
    try {
      const colour = SWATCHES[projects.length % SWATCHES.length]!;
      await window.mochi.projects.create(name, colour);
      setNewName('');
      await reload();
    } finally {
      setBusy(false);
    }
  }, [newName, projects.length, reload]);

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
      <h2 style={h2}>Time</h2>
      <p style={sub}>
        {sessions.length} session{sessions.length === 1 ? '' : 's'} · {humanDuration(totals.grand)}{' '}
        tracked, all stored locally.
      </p>

      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: C.dim, marginBottom: 12 }}>By project</div>
        {totals.rows.length === 0 && (
          <div style={{ fontSize: 13, color: C.faint }}>No projects yet.</div>
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
                  {project.name}
                </span>
                <span style={{ color: C.dim, fontVariantNumeric: 'tabular-nums' }}>
                  {humanDuration(ms)} · {count}
                </span>
              </div>
              <div
                style={{ height: 5, borderRadius: 3, background: '#332c3d', overflow: 'hidden' }}
              >
                <div style={{ width: `${pct}%`, height: '100%', background: project.colour }} />
              </div>
            </div>
          );
        })}

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <input
            style={input}
            placeholder="New project name"
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
            Add
          </button>
        </div>
      </div>

      <div style={{ ...card, maxHeight: 220, overflowY: 'auto' }}>
        <div style={{ fontSize: 12, color: C.dim, marginBottom: 10 }}>History</div>
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
                <span>{p?.name ?? 'General'}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>
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
