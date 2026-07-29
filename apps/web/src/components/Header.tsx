import React from 'react';
import { MochiIcon } from './MochiIcon';

interface HeaderProps {
  onOpenPairing: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenPairing }) => {
  return (
    <header style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '24px 32px',
      borderBottom: '1px solid var(--glass-border)',
      background: 'rgba(255, 255, 255, 0.8)',
      backdropFilter: 'blur(12px)'
    }}>
      {/* Title & Welcome */}
      <div>
        <h2 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-main)' }}>
          Welcome back, <span className="gradient-text">Pioneer</span>! 👋
        </h2>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
          Mochi is active and helping you manage work time and daily rhythm.
        </p>
      </div>

      {/* Right Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {/* Live Companion Status Badge */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 14px',
          borderRadius: '20px',
          background: 'rgba(5, 150, 105, 0.08)',
          border: '1px solid rgba(5, 150, 105, 0.2)',
          fontSize: '13px',
          fontWeight: '700',
          color: '#059669'
        }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#059669', boxShadow: '0 0 8px #059669' }}></span>
          <MochiIcon size={18} glow={false} /> Mochi: Working 👨‍💻 (8 FPS)
        </div>

        {/* Founding Pioneer Badge */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '8px 14px',
          borderRadius: '20px',
          background: 'rgba(217, 119, 6, 0.08)',
          border: '1px solid rgba(217, 119, 6, 0.2)',
          fontSize: '13px',
          fontWeight: '700',
          color: '#d97706'
        }}>
          🌟 Founding Pioneer
        </div>

        {/* Pair Button */}
        <button onClick={onOpenPairing} className="btn-secondary" style={{ padding: '8px 14px', fontSize: '13px' }}>
          🔗 Pair Desktop
        </button>
      </div>
    </header>
  );
};
