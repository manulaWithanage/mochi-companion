import { useEffect, useState, type JSX } from 'react';
import { categoryIcon, categoryLabel, type Project, type TimerSnapshot } from '@mochi/core';

interface OverlayCategoryPillsProps {
  timer: TimerSnapshot | null;
  visible: boolean;
  onHoverChange: (interactive: boolean) => void;
}

export function OverlayCategoryPills({
  timer,
  visible,
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

  let primaryProjects = primaryIds
    .map((id) => projects.find((p) => p.id === id))
    .filter((p): p is Project => p !== undefined);

  if (primaryProjects.length === 0 && projects.length > 0) {
    primaryProjects = projects.slice(0, 3);
  }

  if (primaryProjects.length === 0) return null;

  const activeProjectId = timer?.running ? timer.projectId : null;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 8,
        left: '50%',
        transform: visible
          ? 'translateX(-50%) translateY(0) scale(1)'
          : 'translateX(-50%) translateY(14px) scale(0.85)',
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        zIndex: 25,
        transition: 'all 240ms cubic-bezier(0.34, 1.56, 0.64, 1)',
      }}
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
    >
      {primaryProjects.map((project) => {
        const isActive = activeProjectId === project.id;
        const isHovered = activeHoverId === project.id;

        // Shared with the Time tab's overlay preview, so what is shown in
        // settings is what actually appears under Mochi.
        const iconChar = categoryIcon(project.name);
        const plainName = categoryLabel(project.name) || project.name;

        return (
          <button
            key={project.id}
            type="button"
            title={`Track under ${plainName}`}
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
                : 'rgba(23, 19, 30, 0.92)',
              backdropFilter: 'blur(10px)',
              border: isActive
                ? `2px solid ${project.colour}`
                : `1px solid ${isHovered ? project.colour : 'rgba(255, 255, 255, 0.22)'}`,
              boxShadow: isActive
                ? `0 0 14px ${project.colour}aa, 0 3px 8px rgba(0,0,0,0.5)`
                : isHovered
                  ? `0 0 10px ${project.colour}88, 0 2px 6px rgba(0,0,0,0.4)`
                  : '0 2px 8px rgba(0,0,0,0.4)',
              color: '#ffffff',
              fontSize: isActive ? 15 : 13,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transform: isHovered ? 'scale(1.22)' : isActive ? 'scale(1.08)' : 'scale(1.0)',
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
