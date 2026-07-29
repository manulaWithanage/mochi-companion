import React from 'react';
import { MochiIcon } from './MochiIcon';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenPairing: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, onOpenPairing }) => {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'stopwatch', label: 'Time Tracking', icon: '⏱️' },
    { id: 'lifestyle', label: 'Lifestyle Rhythm', icon: '🌅' },
    { id: 'skins', label: 'Mascot Skins', icon: '🎭' },
    { id: 'settings', label: 'BYOK & Vault', icon: '🔑' },
  ];

  return (
    <aside style={{
      width: '260px',
      height: '100vh',
      position: 'sticky',
      top: 0,
      background: 'rgba(8, 12, 20, 0.95)',
      backdropFilter: 'blur(20px)',
      borderRight: '1px solid var(--glass-border)',
      display: 'flex',
      flexDirection: 'column',
      padding: '24px 16px',
      zIndex: 50
    }}>
      {/* Brand Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '0 8px 24px 8px', borderBottom: '1px solid var(--glass-border)' }}>
        <MochiIcon size={34} />
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: '700', background: 'var(--primary-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Mochi Cloud
          </h1>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>The Super Assistant</span>
        </div>
      </div>

      {/* Navigation List */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '24px', flex: 1 }}>
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 16px',
                borderRadius: '12px',
                border: 'none',
                background: isActive ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                color: isActive ? '#818cf8' : 'var(--text-muted)',
                fontWeight: isActive ? '600' : '500',
                fontSize: '14px',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s ease',
                boxShadow: isActive ? 'inset 0 0 0 1px rgba(99, 102, 241, 0.3)' : 'none'
              }}
            >
              <span style={{ fontSize: '18px' }}>{item.icon}</span>
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Pair Desktop App Button */}
      <div className="glass-card" style={{ padding: '16px', textAlign: 'center', background: 'rgba(99, 102, 241, 0.05)' }}>
        <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-main)', marginBottom: '4px' }}>
          Desktop Companion
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '12px' }}>
          Connect Mochi desktop overlay via mochi://
        </div>
        <button onClick={onOpenPairing} className="btn-primary" style={{ width: '100%', justifyContent: 'center', fontSize: '13px', padding: '8px 12px' }}>
          🔗 Pair Desktop App
        </button>
      </div>
    </aside>
  );
};
