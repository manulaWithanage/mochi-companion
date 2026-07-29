import React, { useState } from 'react';
import { MochiIcon } from './MochiIcon';
import { LandingMascotCanvas } from './LandingMascotCanvas';

export const Footer: React.FC = () => {
  const [mascotState, setMascotState] = useState<'idle' | 'working' | 'resting' | 'coffee'>('idle');
  const [speechBubble, setSpeechBubble] = useState("Thanks for stopping by! Mochi is waiting to sit on your desktop 🍡");

  return (
    <footer style={{ position: 'relative', background: '#080c14', color: 'var(--text-main)', overflow: 'hidden' }}>
      
      {/* 🌲 3D Papercraft Origami Scenery Banner Container */}
      <div style={{ position: 'relative', width: '100%', height: '240px', overflow: 'hidden' }}>
        
        {/* Papercraft Landscape Image */}
        <img
          src="/papercraft_footer.jpg"
          alt="Mochi 3D Papercraft Origami Scenery"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'center bottom',
            filter: 'brightness(0.95) contract(1.05)'
          }}
        />

        {/* Top Fade Blend into Page Background */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '90px',
          background: 'linear-gradient(to bottom, #080c14 0%, transparent 100%)',
          pointerEvents: 'none'
        }}></div>

        {/* Bottom Fade Blend into Footer Navigation */}
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '100px',
          background: 'linear-gradient(to top, #080c14 0%, transparent 100%)',
          pointerEvents: 'none'
        }}></div>

        {/* 🍡 Interactive Mochi Mascot sitting right in the Papercraft Landscape */}
        <div style={{
          position: 'absolute',
          bottom: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          zIndex: 10
        }}>
          {/* Speech Bubble */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.95)',
            color: '#0f172a',
            padding: '8px 16px',
            borderRadius: '14px',
            fontSize: '13px',
            fontWeight: '600',
            boxShadow: '0 8px 20px rgba(0,0,0,0.3)',
            marginBottom: '8px',
            whiteSpace: 'nowrap',
            animation: 'pop 0.3s ease'
          }}>
            {speechBubble}
          </div>

          {/* Canvas Mascot */}
          <div onClick={() => setMascotState(mascotState === 'idle' ? 'resting' : mascotState === 'resting' ? 'coffee' : 'idle')}>
            <LandingMascotCanvas state={mascotState} size={140} />
          </div>
        </div>
      </div>

      {/* 📄 4-Column Footer Navigation Content */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 32px 32px 32px', position: 'relative', zIndex: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '32px', marginBottom: '40px' }}>
          
          {/* Col 1: Brand & Mission */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <MochiIcon size={32} />
              <span style={{ fontSize: '20px', fontWeight: '800', background: 'var(--primary-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                Mochi
              </span>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.6', marginBottom: '16px' }}>
              Your cozy, open-source desktop AI companion & 1-click time tracker. Make work feel effortless and calm.
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <span style={{ fontSize: '11px', fontWeight: '700', padding: '3px 10px', borderRadius: '12px', background: 'rgba(99,102,241,0.15)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.3)' }}>
                MIT Licensed
              </span>
              <span style={{ fontSize: '11px', fontWeight: '700', padding: '3px 10px', borderRadius: '12px', background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }}>
                100% Private
              </span>
            </div>
          </div>

          {/* Col 2: Product & Features */}
          <div>
            <h4 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-main)', marginBottom: '16px' }}>Product & Tools</h4>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px', color: 'var(--text-muted)' }}>
              <li><a href="https://github.com/manulaWithanage/mochi-companion" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>Windows Desktop App (.exe)</a></li>
              <li><a href="#stopwatch" style={{ color: 'inherit', textDecoration: 'none' }}>1-Click Project Stopwatch</a></li>
              <li><a href="#lifestyle" style={{ color: 'inherit', textDecoration: 'none' }}>9 AM Lifestyle Rhythm</a></li>
              <li><a href="#skins" style={{ color: 'inherit', textDecoration: 'none' }}>Avatar Skin Gallery</a></li>
              <li><a href="#dashboard" style={{ color: 'inherit', textDecoration: 'none' }}>Cloud Analytics Dashboard</a></li>
            </ul>
          </div>

          {/* Col 3: Open Source & Security */}
          <div>
            <h4 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-main)', marginBottom: '16px' }}>Open Source & Trust</h4>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px', color: 'var(--text-muted)' }}>
              <li><a href="https://github.com/manulaWithanage/mochi-companion/blob/main/LICENSE" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>MIT Open Source License</a></li>
              <li><a href="https://github.com/manulaWithanage/mochi-companion/blob/main/LLM_ROUTER_SECURITY.md" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>Native safeStorage Vault</a></li>
              <li><a href="https://github.com/manulaWithanage/mochi-companion/blob/main/SYSTEM_ARCHITECTURE.md" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>System Architecture Specs</a></li>
              <li><a href="https://github.com/manulaWithanage/mochi-companion/blob/main/SCALING_STRATEGY.md" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>BYOK Security Model</a></li>
            </ul>
          </div>

          {/* Col 4: Community & Links */}
          <div>
            <h4 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-main)', marginBottom: '16px' }}>Community</h4>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px', color: 'var(--text-muted)' }}>
              <li><a href="https://github.com/manulaWithanage/mochi-companion" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>GitHub Repository ⭐</a></li>
              <li><a href="https://github.com/manulaWithanage/mochi-companion/issues" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>Report an Issue / Bug</a></li>
              <li><a href="https://github.com/manulaWithanage/mochi-companion/discussions" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>Community Discussions</a></li>
              <li><a href="https://github.com/manulaWithanage/mochi-companion/blob/main/LAUNCH_PLAN.md" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>Founding Pioneer Program</a></li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div style={{
          borderTop: '1px solid var(--glass-border)',
          paddingTop: '24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '12px',
          color: 'var(--text-subtle)',
          flexWrap: 'wrap',
          gap: '12px'
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
