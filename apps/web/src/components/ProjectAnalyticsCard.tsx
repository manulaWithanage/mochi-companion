import React from 'react';

export const ProjectAnalyticsCard: React.FC = () => {
  const projects = [
    { name: 'Project 3: Cloud Dashboard', hours: '4.2 hrs', percentage: 55, color: '#4f46e5' },
    { name: 'Project 1: Electron Overlay', hours: '2.1 hrs', percentage: 28, color: '#7c3aed' },
    { name: 'Project 2: BYOK Router', hours: '1.2 hrs', percentage: 17, color: '#059669' }
  ];

  return (
    <div className="glass-card" style={{ padding: '24px', flex: 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <span style={{ fontSize: '12px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#7c3aed' }}>
            Time Analytics
          </span>
          <h3 style={{ fontSize: '18px', fontWeight: '800', marginTop: '2px' }}>Today's Time Distribution</h3>
        </div>
        <div style={{ fontSize: '14px', fontWeight: '800', color: 'var(--text-main)' }}>
          7.5 Total Hours
        </div>
      </div>

      {/* Progress Stack Bar */}
      <div style={{
        height: '14px',
        width: '100%',
        borderRadius: '8px',
        overflow: 'hidden',
        display: 'flex',
        background: '#e2e8f0',
        marginBottom: '24px'
      }}>
        {projects.map((p, idx) => (
          <div
            key={idx}
            style={{
              width: `${p.percentage}%`,
              background: p.color,
              transition: 'width 0.4s ease'
            }}
          />
        ))}
      </div>

      {/* Breakdown List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {projects.map((p, idx) => (
          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: p.color }}></div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-main)' }}>{p.name}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '500' }}>{p.percentage}% of today's focus time</div>
              </div>
            </div>
            <div style={{ fontSize: '14px', fontWeight: '800', color: 'var(--text-main)' }}>
              {p.hours}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
