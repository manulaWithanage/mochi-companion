import { useEffect, useState, type JSX } from 'react';
import type { Project, TimerSnapshot } from '@mochi/core';

interface OverlayCategoryPillsProps {
  timer: TimerSnapshot | null;
  onHoverChange: (interactive: boolean) => void;
}

export function OverlayCategoryPills({
  timer,
  onHoverChange,
}: OverlayCategoryPillsProps): JSX.Element | null {
  const [projects, setProjects] = useState<readonly Project[]>([]);
  const [primaryIds, setPrimaryIds] = useState<readonly string[]>([]);
  const [activeHoverId, setActiveHoverId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const pList = await window.mochi.projects.list();
      const settings = await window.mochi.settings.get();
      setProjects(pList);
      setPrimaryIds(settings.primaryProjectIds);
    })();

    const offSettings = window.mochi.settings.onChange((next) => {
      setPrimaryIds(next.primaryProjectIds);
    });

    return () => {
      offSettings();
    };
  }, []);

  // Filter 3 primary projects
  let primaryProjects = primaryIds
    .map((id) => projects.find((p) => p.id === id))
    .filter((p): p is Project => p !== undefined);

  // Fallback to first 3 projects if no primary explicitly configured
  if (primaryProjects.length === 0 && projects.length > 0) {
    primaryProjects = projects.slice(0, 3);
  }

  if (primaryProjects.length === 0) return null;

  const activeProjectId = timer?.running ? timer.projectId : null;

  return (
    <div
      style={{
        position: 'absolute',
        top: 8,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        zIndex: 20,
        pointerEvents: 'auto',
      }}
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
    >
      {primaryProjects.map((project) => {
        const isActive = activeProjectId === project.id;
        const isHovered = activeHoverId === project.id;

        // Extract icon or default emoji
        const iconChar = project.name.slice(0, 2).trim() || '⏱️';

        return (
          <button
            key={project.id}
            type="button"
            title={`Track under ${project.name}`}
            onClick={(e) => {
              e.stopPropagation();
              void window.mochi.timer.toggle(project.id);
            }}
            onMouseEnter={() => {
              setActiveHoverId(project.id);
              onHoverChange(true);
            }}
            onMouseLeave={() => {
              setActiveHoverId(null);
            }}
            style={{
              width: isActive ? 34 : 30,
              height: isActive ? 34 : 30,
              borderRadius: '50%',
              background: isActive
                ? `radial-gradient(circle at 30% 30%, ${project.colour}, #1a1625)`
                : 'rgba(27, 23, 34, 0.84)',
              backdropFilter: 'blur(8px)',
              border: isActive
                ? `2px solid ${project.colour}`
                : `1px solid ${isHovered ? project.colour : 'rgba(255, 255, 255, 0.18)'}`,
              boxShadow: isActive
                ? `0 0 14px ${project.colour}88, 0 3px 8px rgba(0,0,0,0.5)`
                : isHovered
                  ? `0 0 10px ${project.colour}66, 0 2px 6px rgba(0,0,0,0.4)`
                  : '0 2px 8px rgba(0,0,0,0.3)',
              color: '#ffffff',
              fontSize: isActive ? 15 : 13,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transform: isHovered ? 'scale(1.22)' : isActive ? 'scale(1.1)' : 'scale(1.0)',
              transition: 'all 180ms cubic-bezier(0.34, 1.56, 0.64, 1)',
              outline: 'none',
              padding: 0,
            }}
          >
            {iconChar}
          </button>
        );
      })}
    </div>
  );
}
