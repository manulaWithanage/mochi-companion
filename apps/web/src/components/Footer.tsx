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
      background: '#ffffff',
      color: '#0f172a',
      overflow: 'hidden',
      border: 'none',
      outline: 'none',
      paddingTop: '64px'
    }}>
      
      {/* 📄 TOP SECTION: CLEAN NAVIGATION COLUMNS (No Outer Borders or Outlines) */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 32px 48px 32px', position: 'relative', zIndex: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '32px' }}>
          
          {/* Col 1: Brand & Mission */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
              <MochiIcon size={34} glow={false} />
              <span style={{ fontSize: '22px', fontWeight: '800', color: '#0f172a' }}>
                Mochi
              </span>
            </div>
            <p style={{ fontSize: '14px', color: '#475569', lineHeight: '1.6', marginBottom: '16px', maxWidth: '280px' }}>
              Your cozy desktop AI companion & 1-click time tracker. Built for focus, calm, and simple daily rhythm.
            </p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '11px', fontWeight: '700', padding: '4px 12px', borderRadius: '14px', background: '#f1f5f9', color: '#4f46e5', border: 'none' }}>
                MIT Licensed
              </span>
              <span style={{ fontSize: '11px', fontWeight: '700', padding: '4px 12px', borderRadius: '14px', background: '#f0fdf4', color: '#16a34a', border: 'none' }}>
                100% Private
              </span>
            </div>
          </div>

          {/* Col 2: Product */}
          <div>
            <h4 style={{ fontSize: '13px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '16px' }}>PRODUCT</h4>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '14px', color: '#334155' }}>
              <li><a href="https://github.com/manulaWithanage/mochi-companion" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>Windows Desktop App (.exe)</a></li>
              <li><a href="#stopwatch" style={{ color: 'inherit', textDecoration: 'none' }}>1-Click Project Stopwatch</a></li>
              <li><a href="#lifestyle" style={{ color: 'inherit', textDecoration: 'none' }}>9 AM Lifestyle Rhythm</a></li>
              <li><a href="#skins" style={{ color: 'inherit', textDecoration: 'none' }}>Avatar Skin Gallery</a></li>
              <li><a href="#dashboard" style={{ color: 'inherit', textDecoration: 'none' }}>Cloud Analytics Dashboard</a></li>
            </ul>
          </div>

          {/* Col 3: Open Source */}
          <div>
            <h4 style={{ fontSize: '13px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '16px' }}>OPEN SOURCE</h4>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '14px', color: '#334155' }}>
              <li><a href="https://github.com/manulaWithanage/mochi-companion/blob/main/LICENSE" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>MIT Open Source License</a></li>
              <li><a href="https://github.com/manulaWithanage/mochi-companion/blob/main/LLM_ROUTER_SECURITY.md" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>Native safeStorage Vault</a></li>
              <li><a href="https://github.com/manulaWithanage/mochi-companion/blob/main/SYSTEM_ARCHITECTURE.md" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>System Architecture Specs</a></li>
              <li><a href="https://github.com/manulaWithanage/mochi-companion/blob/main/SCALING_STRATEGY.md" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>BYOK Security Model</a></li>
            </ul>
          </div>

          {/* Col 4: Community */}
          <div>
            <h4 style={{ fontSize: '13px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '16px' }}>COMMUNITY</h4>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '14px', color: '#334155' }}>
              <li><a href="https://github.com/manulaWithanage/mochi-companion" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>GitHub Repository ⭐</a></li>
              <li><a href="https://github.com/manulaWithanage/mochi-companion/issues" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>Report an Issue / Bug</a></li>
              <li><a href="https://github.com/manulaWithanage/mochi-companion/discussions" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>Community Discussions</a></li>
              <li><a href="https://github.com/manulaWithanage/mochi-companion/blob/main/LAUNCH_PLAN.md" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>Founding Pioneer Program</a></li>
            </ul>
          </div>
        </div>
      </div>

      {/* 🌸 BOTTOM SECTION: ULTRA-DETAILED 3D PAPERCRAFT ORIGAMI JAPANESE SCENERY (Seamless Whole, No Outlines) */}
      <div style={{ position: 'relative', width: '100%', height: '360px', overflow: 'hidden' }}>
        
        {/* Full Bleed Ultra Detail Daytime Scenery Image */}
        <img
          src="/japan_papercraft_ultra_detail.jpg"
          alt="Mochi 8K Ultra Detail 3D Papercraft Origami Japanese Scenery"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'center bottom',
            display: 'block'
          }}
        />

        {/* 🍡 INTERACTIVE MOCHI MASCOT STAGE (Centered in the Ultra Detail Scenery) */}
        <div style={{
          position: 'absolute',
          bottom: '36px',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          zIndex: 10
        }}>
          {/* Speech Bubble */}
          <div style={{
            background: '#ffffff',
            color: '#0f172a',
            padding: '8px 18px',
            borderRadius: '16px',
            fontSize: '13px',
            fontWeight: '600',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.12)',
            marginBottom: '8px',
            whiteSpace: 'nowrap',
            position: 'relative',
            border: 'none'
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
            style={{ cursor: 'pointer', filter: 'drop-shadow(0 10px 20px rgba(0,0,0,0.12))' }}
          >
            <LandingMascotCanvas state={mascotState} size={140} />
          </div>
        </div>

        {/* Copyright bar cleanly integrated into the bottom of the papercraft scenery */}
        <div style={{
          position: 'absolute',
          bottom: '12px',
          left: '32px',
          right: '32px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '12px',
          color: '#334155',
          zIndex: 12,
          fontWeight: '600'
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
