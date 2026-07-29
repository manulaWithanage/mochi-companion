import React, { useState } from 'react';
import { MochiIcon } from './MochiIcon';
import { LandingMascotCanvas } from './LandingMascotCanvas';

export const Footer: React.FC = () => {
  const [mascotState, setMascotState] = useState<'idle' | 'working' | 'resting' | 'coffee'>('idle');
  const [speechBubble, setSpeechBubble] = useState("Mochi is ready to sit on your desktop! 🍡");

  return (
    <footer style={{
      position: 'relative',
      width: '100%',
      minHeight: '720px',
      overflow: 'hidden',
      border: 'none',
      outline: 'none',
      background: '#ffffff'
    }}>
      
      {/* 🌸 FULL 100% CONTINUOUS BACKGROUND IMAGE (From Sky to River) */}
      <img
        src="/japan_papercraft_ultra_detail.jpg"
        alt="Mochi 8K Ultra Detail 3D Papercraft Origami Japanese Scenery"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: 'center top',
          display: 'block',
          zIndex: 1
        }}
      />

      {/* 📄 4 NAVIGATION COLUMNS IN AN ULTRA-SLEEK FROSTED GLASS BOX (100% Readable over Mount Fuji) */}
      <div style={{
        position: 'relative',
        zIndex: 10,
        maxWidth: '1240px',
        margin: '0 auto',
        padding: '48px 24px 20px 24px'
      }}>
        <div style={{
          background: 'rgba(255, 255, 255, 0.88)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRadius: '24px',
          border: '1px solid rgba(255, 255, 255, 0.95)',
          padding: '36px 40px',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.08), 0 4px 12px rgba(0, 0, 0, 0.03)'
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '32px' }}>
            
            {/* Col 1: Brand & Mission */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                <MochiIcon size={34} glow={false} />
                <span style={{ fontSize: '22px', fontWeight: '800', color: '#0f172a' }}>
                  Mochi
                </span>
              </div>
              <p style={{ fontSize: '13px', color: '#475569', lineHeight: '1.6', marginBottom: '16px', maxWidth: '280px', fontWeight: '500' }}>
                Your cozy desktop AI companion & 1-click time tracker. Built for focus, calm, and simple daily rhythm.
              </p>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11px', fontWeight: '700', padding: '4px 12px', borderRadius: '14px', background: '#f1f5f9', color: '#4f46e5', border: '1px solid #cbd5e1' }}>
                  MIT Licensed
                </span>
                <span style={{ fontSize: '11px', fontWeight: '700', padding: '4px 12px', borderRadius: '14px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }}>
                  100% Private
                </span>
              </div>
            </div>

            {/* Col 2: Product */}
            <div>
              <h4 style={{ fontSize: '12px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px' }}>PRODUCT</h4>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '14px', color: '#1e293b', fontWeight: '600' }}>
                <li><a href="https://github.com/manulaWithanage/mochi-companion" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>Windows Desktop App (.exe)</a></li>
                <li><a href="#stopwatch" style={{ color: 'inherit', textDecoration: 'none' }}>1-Click Project Stopwatch</a></li>
                <li><a href="#lifestyle" style={{ color: 'inherit', textDecoration: 'none' }}>9 AM Lifestyle Rhythm</a></li>
                <li><a href="#skins" style={{ color: 'inherit', textDecoration: 'none' }}>Avatar Skin Gallery</a></li>
                <li><a href="#dashboard" style={{ color: 'inherit', textDecoration: 'none' }}>Cloud Analytics Dashboard</a></li>
              </ul>
            </div>

            {/* Col 3: Open Source */}
            <div>
              <h4 style={{ fontSize: '12px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px' }}>OPEN SOURCE</h4>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '14px', color: '#1e293b', fontWeight: '600' }}>
                <li><a href="https://github.com/manulaWithanage/mochi-companion/blob/main/LICENSE" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>MIT Open Source License</a></li>
                <li><a href="https://github.com/manulaWithanage/mochi-companion/blob/main/LLM_ROUTER_SECURITY.md" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>Native safeStorage Vault</a></li>
                <li><a href="https://github.com/manulaWithanage/mochi-companion/blob/main/SYSTEM_ARCHITECTURE.md" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>System Architecture Specs</a></li>
                <li><a href="https://github.com/manulaWithanage/mochi-companion/blob/main/SCALING_STRATEGY.md" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>BYOK Security Model</a></li>
              </ul>
            </div>

            {/* Col 4: Community */}
            <div>
              <h4 style={{ fontSize: '12px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px' }}>COMMUNITY</h4>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '14px', color: '#1e293b', fontWeight: '600' }}>
                <li><a href="https://github.com/manulaWithanage/mochi-companion" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>GitHub Repository ⭐</a></li>
                <li><a href="https://github.com/manulaWithanage/mochi-companion/issues" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>Report an Issue / Bug</a></li>
                <li><a href="https://github.com/manulaWithanage/mochi-companion/discussions" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>Community Discussions</a></li>
                <li><a href="https://github.com/manulaWithanage/mochi-companion/blob/main/LAUNCH_PLAN.md" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>Founding Pioneer Program</a></li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* 🍡 INTERACTIVE MOCHI MASCOT STAGE (Centered in the Papercraft Landscape) */}
      <div style={{
        position: 'relative',
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        marginTop: '12px',
        paddingBottom: '24px'
      }}>
        {/* Speech Bubble */}
        <div style={{
          background: '#ffffff',
          color: '#0f172a',
          padding: '8px 18px',
          borderRadius: '16px',
          fontSize: '13px',
          fontWeight: '600',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.15)',
          marginBottom: '8px',
          whiteSpace: 'nowrap',
          position: 'relative',
          border: '1px solid #cbd5e1'
        }}>
          {speechBubble}
          {/* Bubble Tail */}
          <div style={{
            position: 'absolute',
            bottom: '-6px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 0,
            height: 0,
            borderLeft: '6px solid transparent',
            borderRight: '6px solid transparent',
            borderTop: '6px solid #ffffff'
          }}></div>
        </div>

        {/* Interactive Mascot Canvas */}
        <div
          onClick={() => setMascotState(mascotState === 'idle' ? 'resting' : mascotState === 'resting' ? 'coffee' : 'idle')}
          style={{ cursor: 'pointer', filter: 'drop-shadow(0 10px 20px rgba(0,0,0,0.15))' }}
        >
          <LandingMascotCanvas state={mascotState} size={140} />
        </div>
      </div>

      {/* 📄 FROSTED GLASS BOTTOM BAR (Copyright 100% Readable over papercraft ground) */}
      <div style={{
        position: 'relative',
        zIndex: 12,
        maxWidth: '1240px',
        margin: '0 auto 24px auto',
        padding: '0 24px'
      }}>
        <div style={{
          background: 'rgba(255, 255, 255, 0.92)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderRadius: '16px',
          border: '1px solid rgba(255, 255, 255, 0.95)',
          padding: '12px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '12px',
          color: '#1e293b',
          fontWeight: '600',
          boxShadow: '0 8px 24px rgba(0,0,0,0.06)'
        }}>
          <div>
            © 2026 <strong>manulaWithanage</strong> & Mochi contributors. Built for focus.
          </div>
          <div>
            Released under the <strong>MIT License</strong>
          </div>
        </div>
      </div>

    </footer>
  );
};
