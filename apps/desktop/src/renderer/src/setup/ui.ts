/**
 * Shared visual tokens for the dashboard.
 *
 * Kept in one place so the tabs actually look like one product. Inline styles
 * rather than CSS modules because the renderer is deliberately dependency-light
 * and these are consumed by a handful of components.
 */

export const C = {
  bg: '#1b1720',
  panel: '#221d29',
  panelAlt: '#241f2b',
  border: '#2c2634',
  borderStrong: '#3b3244',
  text: '#f4eef6',
  dim: 'rgba(244, 238, 246, 0.58)',
  faint: 'rgba(244, 238, 246, 0.38)',
  accent: '#f2a6b3',
  good: '#a8e6b8',
  warn: '#ffb3c1',
} as const;

export const card: React.CSSProperties = {
  border: `1px solid ${C.border}`,
  borderRadius: 14,
  padding: '16px 18px',
  background: C.panel,
};

export const label: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  letterSpacing: 0.6,
  textTransform: 'uppercase',
  color: C.dim,
  marginBottom: 7,
};

export const input: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  borderRadius: 10,
  border: `1px solid ${C.borderStrong}`,
  background: C.panelAlt,
  color: C.text,
  fontSize: 14,
  boxSizing: 'border-box',
};

export const button = (variant: 'primary' | 'ghost' | 'danger' = 'ghost'): React.CSSProperties => {
  if (variant === 'primary') {
    return {
      padding: '8px 18px',
      borderRadius: 10,
      border: '1px solid rgba(242, 166, 179, 0.45)',
      borderTop: '1px solid rgba(255, 255, 255, 0.3)',
      background: 'linear-gradient(180deg, #3f334c 0%, #282032 100%)',
      color: '#ffffff',
      fontSize: 13,
      fontWeight: 750,
      cursor: 'pointer',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
      transition: 'all 180ms cubic-bezier(0.16, 1, 0.3, 1)',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      textShadow: '0 1px 2px rgba(0, 0, 0, 0.6)',
    };
  }

  if (variant === 'danger') {
    return {
      padding: '8px 18px',
      borderRadius: 10,
      border: '1px solid rgba(230, 57, 86, 0.45)',
      borderTop: '1px solid rgba(255, 255, 255, 0.3)',
      background: 'linear-gradient(180deg, #4d232c 0%, #30141a 100%)',
      color: '#ffb3c1',
      fontSize: 13,
      fontWeight: 750,
      cursor: 'pointer',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
      transition: 'all 180ms cubic-bezier(0.16, 1, 0.3, 1)',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      textShadow: '0 1px 2px rgba(0, 0, 0, 0.6)',
    };
  }

  return {
    padding: '8px 16px',
    borderRadius: 10,
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderTop: '1px solid rgba(255, 255, 255, 0.18)',
    background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.07) 0%, rgba(255, 255, 255, 0.03) 100%)',
    color: C.text,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    boxShadow: '0 2px 6px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
    transition: 'all 180ms cubic-bezier(0.16, 1, 0.3, 1)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  };
};

export const h2: React.CSSProperties = {
  margin: '0 0 2px',
  fontSize: 19,
  fontWeight: 650,
};

export const sub: React.CSSProperties = {
  margin: '0 0 18px',
  fontSize: 13,
  color: C.dim,
};

/** `2h 51m` from milliseconds, for headline figures. */
export function humanDuration(ms: number): string {
  const mins = Math.floor(Math.max(0, ms) / 60_000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

/** Local `YYYY-MM-DD`, matching how the rest of the app buckets days. */
export function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
