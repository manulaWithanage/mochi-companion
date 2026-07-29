import React from 'react';

export const LifestyleCard: React.FC = () => {
  const scheduleItems = [
    { time: '09:00 AM', label: 'Breakfast & Morning Briefing', status: 'completed', icon: '☕', note: 'Checked in & hydrated' },
    { time: '01:00 PM', label: 'Lunch & Screen Break', status: 'completed', icon: '🥗', note: '30-min stretch' },
    { time: '04:00 PM', label: 'Hydration & Posture Check', status: 'upcoming', icon: '💧', note: 'Mochi prompt' },
    { time: '06:00 PM', label: 'Evening Work Wind-Down', status: 'pending', icon: '🌅', note: 'Daily summary' }
  ];

  return (
    <div className="glass-card" style={{ padding: '24px', flex: 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <span style={{ fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#10b981' }}>
            Daily Lifestyle Rhythm
          </span>
          <h3 style={{ fontSize: '18px', fontWeight: '700', marginTop: '2px' }}>Wellness & Routine Schedule</h3>
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          Target: 09:00 AM - 06:00 PM
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative' }}>
        {/* Timeline Line */}
        <div style={{
          position: 'absolute',
          top: '12px',
          bottom: '12px',
          left: '20px',
          width: '2px',
          background: 'rgba(255, 255, 255, 0.08)',
          zIndex: 1
        }}></div>

        {scheduleItems.map((item, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '16px', zIndex: 2 }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: item.status === 'completed' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.05)',
              border: item.status === 'completed' ? '1px solid #10b981' : '1px solid var(--glass-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '18px',
              flexShrink: 0
            }}>
              {item.icon}
            </div>

            <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: '600', color: item.status === 'completed' ? 'var(--text-main)' : 'var(--text-muted)' }}>
                  {item.label}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-subtle)' }}>
                  {item.note}
                </div>
              </div>
              <div style={{
                fontSize: '12px',
                fontWeight: '600',
                padding: '4px 10px',
                borderRadius: '8px',
                background: item.status === 'completed' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255, 255, 255, 0.04)',
                color: item.status === 'completed' ? '#10b981' : 'var(--text-muted)'
              }}>
                {item.time}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
