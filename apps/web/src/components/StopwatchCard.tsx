import React, { useState, useEffect } from 'react';

export const StopwatchCard: React.FC = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [seconds, setSeconds] = useState(6420); // 1h 47m 00s initial default demo
  const [activeProject, setActiveProject] = useState('Project 3: Mochi Cloud Dashboard');

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isRunning) {
      timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    }
    return () => clearInterval(timer);
  }, [isRunning]);

  const formatTime = (totalSeconds: number) => {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="glass-card" style={{ padding: '24px', flex: 1, position: 'relative', overflow: 'hidden' }}>
      {/* Background Accent Glow */}
      <div style={{
        position: 'absolute',
        top: '-40px',
        right: '-40px',
        width: '180px',
        height: '180px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(236,72,153,0.15) 0%, transparent 70%)',
        pointerEvents: 'none'
      }}></div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <span style={{ fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#ec4899' }}>
            1-Click Time Tracker
          </span>
          <h3 style={{ fontSize: '18px', fontWeight: '700', marginTop: '2px' }}>Project Stopwatch</h3>
        </div>

        {/* Working State Visual Badge */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 12px',
          borderRadius: '12px',
          background: isRunning ? 'rgba(236, 72, 153, 0.15)' : 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(236, 72, 153, 0.3)',
          fontSize: '12px',
          color: isRunning ? '#ec4899' : 'var(--text-muted)'
        }}>
          {isRunning ? '👓 Mochi is typing on mini laptop...' : '💤 Stopwatch Idle'}
        </div>
      </div>

      {/* Project Selector */}
      <div style={{ marginBottom: '20px' }}>
        <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
          Select Active Project
        </label>
        <select
          value={activeProject}
          onChange={(e) => setActiveProject(e.target.value)}
          style={{
            width: '100%',
            padding: '10px 14px',
            borderRadius: '10px',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid var(--glass-border)',
            color: 'var(--text-main)',
            fontSize: '14px',
            outline: 'none'
          }}
        >
          <option value="Project 3: Mochi Cloud Dashboard">Project 3: Mochi Cloud Dashboard</option>
          <option value="Project 1: Electron Overlay Engine">Project 1: Electron Overlay Engine</option>
          <option value="Project 2: BYOK Key Vault & Router">Project 2: BYOK Key Vault & Router</option>
        </select>
      </div>

      {/* Timer Display */}
      <div style={{
        textAlign: 'center',
        padding: '24px 0',
        background: 'rgba(0, 0, 0, 0.2)',
        borderRadius: '16px',
        border: '1px solid rgba(255, 255, 255, 0.05)',
        marginBottom: '20px'
      }}>
        <div style={{
          fontSize: '48px',
          fontWeight: '800',
          fontFamily: 'var(--font-heading)',
          letterSpacing: '0.02em',
          background: 'var(--primary-gradient)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent'
        }}>
          {formatTime(seconds)}
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
          Active Session • {activeProject}
        </div>
      </div>

      {/* Action Controls */}
      <div style={{ display: 'flex', gap: '12px' }}>
        <button
          onClick={() => setIsRunning(!isRunning)}
          className="btn-primary"
          style={{ flex: 1, justifyContent: 'center', padding: '12px' }}
        >
          {isRunning ? '⏸️ Pause Stopwatch' : '▶️ Start Stopwatch'}
        </button>
        <button
          onClick={() => { setIsRunning(false); setSeconds(0); }}
          className="btn-secondary"
          style={{ padding: '12px 16px' }}
        >
          🔄 Reset
        </button>
      </div>
    </div>
  );
};
