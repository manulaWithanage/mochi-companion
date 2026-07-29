import React, { useState } from 'react';
import { MochiIcon } from './MochiIcon';
import { LandingMascotCanvas } from './LandingMascotCanvas';

export const Footer: React.FC = () => {
  const [mascotState, setMascotState] = useState<'idle' | 'working' | 'resting' | 'coffee'>('idle');
  const [speechBubble, setSpeechBubble] = useState("Good morning! 🌸 Mochi is ready to sit on your desktop!");

  return (
    <footer style={{
      position: 'relative',
      width: '100%',
      minHeight: '620px',
      overflow: 'hidden',
      borderTop: '1px solid var(--glass-border)',
      background: '#080c14'
    }}>
      
      {/* 🌸 FULL-BLEED BORDERLESS WARM MORNING 3D PAPERCRAFT ORIGAMI SCENERY */}
      <img
        src="/japan_morning_papercraft.jpg"
        alt="Mochi Warm Morning 3D Papercraft Origami Scenery"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: 'center center',
          display: 'block',
          zIndex: 1
        }}
      />

      {/* 🍡 INTERACTIVE MOCHI MASCOT STAGE (Floating in the Warm Morning Papercraft World) */}
      <div style={{
        position: 'relative',
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: '50px',
        paddingBottom: '20px'
      }}>
        {/* Speech Bubble */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.95)',
          color: '#0f172a',
          padding: '10px 22px',
          borderRadius: '20px',
          fontSize: '14px',
          fontWeight: '600',
          boxShadow: '0 14px 40px rgba(0, 0, 0, 0.4)',
          marginBottom: '12px',
          whiteSpace: 'nowrap',
          position: 'relative'
        }}>
          {speechBubble}
          {/* Bubble Tail */}
          <div style={{
            position: 'absolute',
            bottom: '-7px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 0,
            height: 0,
            borderLeft: '7px solid transparent',
            borderRight: '7px solid transparent',
            borderTop: '7px solid rgba(255, 255, 255, 0.95)'
          }}></div>
        </div>

        {/* Interactive Mascot Canvas */}
        <div
          onClick={() => setMascotState(mascotState === 'idle' ? 'resting' : mascotState === 'resting' ? 'coffee' : 'idle')}
          style={{ cursor: 'pointer', filter: 'drop-shadow(0 14px 28px rgba(0,0,0,0.5))' }}
        >
          <LandingMascotCanvas state={mascotState} size={160} />
        </div>
      </div>

      {/* 📄 4 NAVIGATION COLUMNS FLOATING DIRECTLY ON TOP OF THE WARM MORNING SCENERY (ZERO FRAMES OR BOXES!) */}
      <div style={{
        position: 'relative',
        zIndex: 10,
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '20px 32px 32px 32px'
      }}>
        {/* 4 Navigation Columns */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '32px',
          marginBottom: '32px'
        }}>
          
          {/* Col 1: Brand & Mission */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
              <MochiIcon size={32} />
              <span style={{ fontSize: '20px', fontWeight: '800', background: 'var(--primary-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                Mochi
              </span>
            </div>
            <p style={{ fontSize: '13px', color: '#ffffff', textShadow: '0 2px 10px rgba(0,0,0,0.95), 0 0 4px rgba(0,0,0,0.8)', lineHeight: '1.6', marginBottom: '16px', fontWeight: '500' }}>
              Your cozy desktop AI companion & 1-click time tracker. Inspired by 3D Japanese Origami Zen simplicity.
            </p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '11px', fontWeight: '700', padding: '4px 12px', borderRadius: '12px', background: 'rgba(15, 23, 42, 0.75)', color: '#a5b4fc', border: '1px solid rgba(255,255,255,0.2)', backdropFilter: 'blur(8px)' }}>
                MIT Licensed
              </span>
              <span style={{ fontSize: '11px', fontWeight: '700', padding: '4px 12px', borderRadius: '12px', background: 'rgba(15, 23, 42, 0.75)', color: '#6ee7b7', border: '1px solid rgba(255,255,255,0.2)', backdropFilter: 'blur(8px)' }}>
                100% Private
              </span>
            </div>
          </div>

          {/* Col 2: Product & Tools */}
          <div>
            <h4 style={{ fontSize: '15px', fontWeight: '700', color: '#ffffff', textShadow: '0 2px 10px rgba(0,0,0,0.95)', marginBottom: '14px' }}>Product & Tools</h4>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px', color: '#ffffff', textShadow: '0 2px 10px rgba(0,0,0,0.95)', fontWeight: '500' }}>
              <li><a href="https://github.com/manulaWithanage/mochi-companion" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>Windows Desktop App (.exe)</a></li>
              <li><a href="#stopwatch" style={{ color: 'inherit', textDecoration: 'none' }}>1-Click Project Stopwatch</a></li>
              <li><a href="#lifestyle" style={{ color: 'inherit', textDecoration: 'none' }}>9 AM Lifestyle Rhythm</a></li>
              <li><a href="#skins" style={{ color: 'inherit', textDecoration: 'none' }}>Avatar Skin Gallery</a></li>
              <li><a href="#dashboard" style={{ color: 'inherit', textDecoration: 'none' }}>Cloud Analytics Dashboard</a></li>
            </ul>
          </div>

          {/* Col 3: Open Source & Security */}
          <div>
            <h4 style={{ fontSize: '15px', fontWeight: '700', color: '#ffffff', textShadow: '0 2px 10px rgba(0,0,0,0.95)', marginBottom: '14px' }}>Open Source & Trust</h4>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px', color: '#ffffff', textShadow: '0 2px 10px rgba(0,0,0,0.95)', fontWeight: '500' }}>
              <li><a href="https://github.com/manulaWithanage/mochi-companion/blob/main/LICENSE" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>MIT Open Source License</a></li>
              <li><a href="https://github.com/manulaWithanage/mochi-companion/blob/main/LLM_ROUTER_SECURITY.md" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>Native safeStorage Vault</a></li>
              <li><a href="https://github.com/manulaWithanage/mochi-companion/blob/main/SYSTEM_ARCHITECTURE.md" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>System Architecture Specs</a></li>
              <li><a href="https://github.com/manulaWithanage/mochi-companion/blob/main/SCALING_STRATEGY.md" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>BYOK Security Model</a></li>
            </ul>
          </div>

          {/* Col 4: Community & Links */}
          <div>
            <h4 style={{ fontSize: '15px', fontWeight: '700', color: '#ffffff', textShadow: '0 2px 10px rgba(0,0,0,0.95)', marginBottom: '14px' }}>Community</h4>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px', color: '#ffffff', textShadow: '0 2px 10px rgba(0,0,0,0.95)', fontWeight: '500' }}>
              <li><a href="https://github.com/manulaWithanage/mochi-companion" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>GitHub Repository ⭐</a></li>
              <li><a href="https://github.com/manulaWithanage/mochi-companion/issues" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>Report an Issue / Bug</a></li>
              <li><a href="https://github.com/manulaWithanage/mochi-companion/discussions" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>Community Discussions</a></li>
              <li><a href="https://github.com/manulaWithanage/mochi-companion/blob/main/LAUNCH_PLAN.md" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>Founding Pioneer Program</a></li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div style={{
          borderTop: '1px solid rgba(255, 255, 255, 0.25)',
          paddingTop: '18px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '12px',
          color: '#ffffff',
          textShadow: '0 2px 10px rgba(0,0,0,0.95)',
          flexWrap: 'wrap',
          gap: '12px',
          fontWeight: '500'
        }}>
          <div>
            Copyright © 2026 <strong>manulaWithanage</strong> & Mochi contributors. Built with ❤️ for developers.
          </div>
          <div>
            Released under the <strong>MIT License</strong>
          </div>
        </div>
      </div>

    </footer>
  );
};
