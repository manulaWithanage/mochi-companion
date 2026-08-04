import React from 'react';

export interface SegmentOption<T extends string = string> {
  id: T;
  label: string;
  icon?: React.ReactNode;
}

export interface SegmentedControlProps<T extends string = string> {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (val: T) => void;
  size?: 'sm' | 'md';
  style?: React.CSSProperties;
}

export function SegmentedControl<T extends string = string>({
  options,
  value,
  onChange,
  size = 'md',
  style,
}: SegmentedControlProps<T>): JSX.Element {
  const activeIndex = Math.max(
    0,
    options.findIndex((o) => o.id === value)
  );
  const count = options.length;

  const height = size === 'sm' ? 32 : 36;
  const fontSize = size === 'sm' ? 11.5 : 12.5;

  return (
    <div
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        background: 'rgba(18, 14, 26, 0.85)',
        padding: 3,
        borderRadius: 10,
        border: '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: 'inset 0 2px 6px rgba(0, 0, 0, 0.5)',
        height,
        boxSizing: 'border-box',
        userSelect: 'none',
        ...style,
      }}
    >
      {/* Sliding Active Pill Indicator */}
      <div
        style={{
          position: 'absolute',
          top: 3,
          bottom: 3,
          left: `calc(3px + ${activeIndex} * ((100% - 6px) / ${count}))`,
          width: `calc((100% - 6px) / ${count})`,
          background: 'linear-gradient(180deg, #3f334c 0%, #282032 100%)',
          borderRadius: 7,
          border: '1px solid rgba(242, 166, 179, 0.45)',
          borderTop: '1px solid rgba(255, 255, 255, 0.3)',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
          transition: 'left 260ms cubic-bezier(0.16, 1, 0.3, 1), width 260ms ease',
          pointerEvents: 'none',
          zIndex: 1,
        }}
      />

      {/* Option Buttons */}
      {options.map((opt) => {
        const active = opt.id === value;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            style={{
              position: 'relative',
              zIndex: 2,
              flex: 1,
              height: '100%',
              background: 'transparent',
              border: 'none',
              borderRadius: 7,
              padding: '0 14px',
              fontSize,
              fontWeight: active ? 750 : 500,
              color: active ? '#ffffff' : 'rgba(244, 238, 246, 0.55)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              transition: 'color 180ms ease, opacity 180ms ease',
              whiteSpace: 'nowrap',
              textShadow: active ? '0 1px 2px rgba(0, 0, 0, 0.6)' : 'none',
            }}
            onMouseEnter={(e) => {
              if (!active) {
                e.currentTarget.style.color = '#f4eef6';
              }
            }}
            onMouseLeave={(e) => {
              if (!active) {
                e.currentTarget.style.color = 'rgba(244, 238, 246, 0.55)';
              }
            }}
          >
            {opt.icon !== undefined && (
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  opacity: active ? 1 : 0.7,
                  transition: 'opacity 180ms ease',
                }}
              >
                {opt.icon}
              </span>
            )}
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
