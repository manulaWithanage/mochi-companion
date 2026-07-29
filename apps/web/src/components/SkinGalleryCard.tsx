import React, { useState } from 'react';

export const SkinGalleryCard: React.FC = () => {
  const [selectedSkin, setSelectedSkin] = useState('mochi');

  const skins = [
    { id: 'mochi', name: 'Default Mochi', icon: '🍡', desc: 'Original squishy mochi pet with cozy animations', tag: 'Active', unlocked: true },
    { id: 'cyberpunk', name: 'Cyberpunk Bot', icon: '🤖', desc: 'Futuristic neon robot companion with glowing eyes', tag: 'Unlocked', unlocked: true },
    { id: 'golden', name: 'Golden Mochi', icon: '🌟', desc: 'Exclusive Pioneer skin for early beta supporters', tag: 'Founding Perk', unlocked: true },
    { id: 'cat', name: 'Pixel Cat', icon: '🐱', desc: 'Retro 8-bit kitten that sleeps next to your clock', tag: 'Community', unlocked: true }
  ];

  return (
    <div className="glass-card" style={{ padding: '24px', width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <span style={{ fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#f59e0b' }}>
            Mascot Skin Gallery
          </span>
          <h3 style={{ fontSize: '18px', fontWeight: '700', marginTop: '2px' }}>Custom Avatar Skins</h3>
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          Community Canvas 2D Sprites
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        {skins.map((skin) => {
          const isSelected = selectedSkin === skin.id;
          return (
            <div
              key={skin.id}
              onClick={() => setSelectedSkin(skin.id)}
              style={{
                padding: '20px',
                borderRadius: '14px',
                background: isSelected ? 'rgba(99, 102, 241, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                border: isSelected ? '1px solid #6366f1' : '1px solid var(--glass-border)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                position: 'relative'
              }}
            >
              {/* Badge */}
              <span style={{
                position: 'absolute',
                top: '12px',
                right: '12px',
                fontSize: '10px',
                fontWeight: '700',
                padding: '2px 8px',
                borderRadius: '10px',
                background: isSelected ? '#6366f1' : 'rgba(255, 255, 255, 0.08)',
                color: 'white'
              }}>
                {isSelected ? 'Active Skin' : skin.tag}
              </span>

              {/* Skin Icon */}
              <div style={{
                fontSize: '48px',
                margin: '12px 0',
                filter: isSelected ? 'drop-shadow(0 0 12px rgba(99, 102, 241, 0.6))' : 'none',
                transition: 'transform 0.2s ease',
                transform: isSelected ? 'scale(1.1)' : 'scale(1)'
              }}>
                {skin.icon}
              </div>

              <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-main)', marginBottom: '4px' }}>
                {skin.name}
              </div>

              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {skin.desc}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
