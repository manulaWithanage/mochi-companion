import React, { useState } from 'react';

export const SkinGalleryCard: React.FC = () => {
  const [selectedSkin, setSelectedSkin] = useState('mochi');

  const skins = [
    {
      id: 'mochi',
      name: 'Default Mochi',
      icon: '🍡',
      desc: 'Original squishy mochi pet with cozy animations',
      tag: 'Active',
      unlocked: true,
    },
    {
      id: 'cyberpunk',
      name: 'Cyberpunk Bot',
      icon: '🤖',
      desc: 'Futuristic neon robot companion with glowing eyes',
      tag: 'Unlocked',
      unlocked: true,
    },
    {
      id: 'golden',
      name: 'Golden Mochi',
      icon: '🌟',
      desc: 'Exclusive Pioneer skin for early beta supporters',
      tag: 'Founding Perk',
      unlocked: true,
    },
    {
      id: 'cat',
      name: 'Pixel Cat',
      icon: '🐱',
      desc: 'Retro 8-bit kitten that sleeps next to your clock',
      tag: 'Community',
      unlocked: true,
    },
  ];

  return (
    <div className="glass-card" style={{ padding: '24px', width: '100%' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
        }}
      >
        <div>
          <span
            style={{
              fontSize: '12px',
              fontWeight: '800',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: '#d97706',
            }}
          >
            Mascot Skin Gallery
          </span>
          <h3 style={{ fontSize: '18px', fontWeight: '800', marginTop: '2px' }}>
            Custom Avatar Skins
          </h3>
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600' }}>
          Community Canvas 2D Sprites
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px',
        }}
      >
        {skins.map((skin) => {
          const isSelected = selectedSkin === skin.id;
          return (
            <div
              key={skin.id}
              onClick={() => setSelectedSkin(skin.id)}
              style={{
                padding: '20px',
                borderRadius: '14px',
                background: isSelected ? 'rgba(79, 70, 229, 0.06)' : '#ffffff',
                border: isSelected ? '2px solid #4f46e5' : '1px solid var(--glass-border)',
                boxShadow: isSelected
                  ? '0 10px 25px rgba(79, 70, 229, 0.15)'
                  : '0 2px 8px rgba(0,0,0,0.03)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                position: 'relative',
              }}
            >
              {/* Badge */}
              <span
                style={{
                  position: 'absolute',
                  top: '12px',
                  right: '12px',
                  fontSize: '10px',
                  fontWeight: '800',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  background: isSelected ? '#4f46e5' : '#f1f5f9',
                  color: isSelected ? 'white' : '#64748b',
                }}
              >
                {isSelected ? 'Active Skin' : skin.tag}
              </span>

              {/* Skin Icon */}
              <div
                style={{
                  fontSize: '48px',
                  margin: '12px 0',
                  filter: isSelected ? 'drop-shadow(0 0 10px rgba(79, 70, 229, 0.4))' : 'none',
                  transition: 'transform 0.2s ease',
                  transform: isSelected ? 'scale(1.1)' : 'scale(1)',
                }}
              >
                {skin.icon}
              </div>

              <div
                style={{
                  fontSize: '15px',
                  fontWeight: '800',
                  color: 'var(--text-main)',
                  marginBottom: '4px',
                }}
              >
                {skin.name}
              </div>

              <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '500' }}>
                {skin.desc}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
