import React from 'react';
import { MochiIcon } from './MochiIcon';

export const Footer: React.FC = () => {
  return (
    <footer style={{
      position: 'relative',
      width: '100%',
      background: '#f8fafc',
      color: '#0f172a',
      overflow: 'hidden',
      border: 'none',
      outline: 'none',
      paddingTop: '48px',
      paddingBottom: 0,
      marginBottom: 0
    }}>
      
      {/* 📄 TOP NAVIGATION SECTION (Apple/Linear-Style Frosted Glass Container) */}
      <div style={{ maxWidth: '1200px', margin: '0 auto 48px auto', padding: '0 24px', position: 'relative', zIndex: 10 }}>
        
        <div style={{
          background: 'rgba(255, 255, 255, 0.85)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRadius: '28px',
          border: '1px solid rgba(0, 0, 0, 0.08)',
          padding: '44px 48px 32px 48px',
          boxShadow: '0 12px 36px rgba(0, 0, 0, 0.04)'
        }}>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '40px', marginBottom: '36px' }}>
            
            {/* Col 1: Brand & Mission */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <MochiIcon size={34} glow={false} />
                <div>
                  <span style={{ fontSize: '22px', fontWeight: '800', background: 'var(--primary-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                    Mochi
                  </span>
                  <span style={{ fontSize: '11.5px', color: '#64748b', marginLeft: '6px', fontWeight: '600' }}>Companion</span>
                </div>
              </div>
              <p style={{ fontSize: '14px', color: '#475569', lineHeight: '1.65', marginBottom: '20px', maxWidth: '280px', fontWeight: '500' }}>
                Your cozy desktop AI companion & 1-click time tracker. Built for focus, calm, and simple daily rhythm.
              </p>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11px', fontWeight: '700', padding: '5px 13px', borderRadius: '14px', background: 'rgba(79, 70, 229, 0.08)', color: '#4f46e5', border: '1px solid rgba(79, 70, 229, 0.18)' }}>
                  MIT Licensed
                </span>
                <span style={{ fontSize: '11px', fontWeight: '700', padding: '5px 13px', borderRadius: '14px', background: 'rgba(16, 185, 129, 0.08)', color: '#059669', border: '1px solid rgba(16, 185, 129, 0.18)' }}>
                  100% Private
                </span>
              </div>
            </div>

            {/* Col 2: Product */}
            <div>
              <h4 style={{ fontSize: '12px', fontWeight: '800', color: '#4f46e5', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '18px' }}>
                PRODUCT
              </h4>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '14px', color: '#334155', fontWeight: '500', padding: 0, margin: 0 }}>
                <li><a href="https://github.com/manulaWithanage/mochi-companion" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>Windows Desktop App (.exe)</a></li>
                <li><a href="#stopwatch" style={{ color: 'inherit', textDecoration: 'none' }}>1-Click Project Stopwatch</a></li>
                <li><a href="#routine" style={{ color: 'inherit', textDecoration: 'none' }}>9 AM Lifestyle Rhythm</a></li>
                <li><a href="#capabilities" style={{ color: 'inherit', textDecoration: 'none' }}>Daily Tasks & Email Nudges</a></li>
                <li><a href="#dashboard" style={{ color: 'inherit', textDecoration: 'none' }}>Cloud Analytics Dashboard</a></li>
              </ul>
            </div>

            {/* Col 3: Open Source */}
            <div>
              <h4 style={{ fontSize: '12px', fontWeight: '800', color: '#4f46e5', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '18px' }}>
                OPEN SOURCE
              </h4>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '14px', color: '#334155', fontWeight: '500', padding: 0, margin: 0 }}>
                <li><a href="https://github.com/manulaWithanage/mochi-companion/blob/main/LICENSE" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>MIT Open Source License</a></li>
                <li><a href="https://github.com/manulaWithanage/mochi-companion/blob/main/LLM_ROUTER_SECURITY.md" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>Native safeStorage Vault</a></li>
                <li><a href="https://github.com/manulaWithanage/mochi-companion/blob/main/SYSTEM_ARCHITECTURE.md" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>System Architecture Specs</a></li>
                <li><a href="https://github.com/manulaWithanage/mochi-companion/blob/main/SCALING_STRATEGY.md" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>BYOK Security Model</a></li>
              </ul>
            </div>

            {/* Col 4: Community */}
            <div>
              <h4 style={{ fontSize: '12px', fontWeight: '800', color: '#4f46e5', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '18px' }}>
                COMMUNITY
              </h4>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '14px', color: '#334155', fontWeight: '500', padding: 0, margin: 0 }}>
                <li><a href="https://github.com/manulaWithanage/mochi-companion" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>GitHub Repository ⭐</a></li>
                <li><a href="https://github.com/manulaWithanage/mochi-companion/issues" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>Report an Issue / Bug</a></li>
                <li><a href="https://github.com/manulaWithanage/mochi-companion/discussions" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>Community Discussions</a></li>
                <li><a href="https://github.com/manulaWithanage/mochi-companion/blob/main/LAUNCH_PLAN.md" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>Founding Pioneer Program</a></li>
              </ul>
            </div>

          </div>

          {/* Copyright Bar (Divided by Soft Glass Line) */}
          <div style={{
            paddingTop: '24px',
            borderTop: '1px solid rgba(0, 0, 0, 0.06)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '13.5px',
            color: '#64748b',
            fontWeight: '500',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            <div>
              © 2026 <strong>Mochi Companion</strong>. Developed by <strong>Manula Withanage</strong>.
            </div>
            <div>
              Released under the <strong>MIT License</strong>
            </div>
          </div>

        </div>

      </div>

      {/* 🌸 BOTTOM SECTION: EXPANDED 620px TALL 3D PAPERCRAFT LANDSCAPE BANNER */}
      <div style={{ position: 'relative', width: '100%', height: '620px', overflow: 'hidden', margin: 0, padding: 0 }}>
        
        {/* Silky Feather-Soft Top Gradient Transition */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '120px',
          background: 'linear-gradient(to bottom, #f8fafc 0%, rgba(248, 250, 252, 0.85) 45%, transparent 100%)',
          zIndex: 2,
          pointerEvents: 'none'
        }}></div>

        {/* Full Bleed Scenery Image */}
        <img
          src="/perfect_footer_banner.jpg"
          alt="Mochi 3D Papercraft Origami Japanese Scenery Banner Full View"
          style={{
            width: '100%',
            height: 'calc(100% + 24px)',
            objectFit: 'cover',
            objectPosition: 'center 40%',
            transform: 'scale(1.04) translateY(12px)',
            display: 'block',
            zIndex: 1
          }}
        />
      </div>

    </footer>
  );
};
