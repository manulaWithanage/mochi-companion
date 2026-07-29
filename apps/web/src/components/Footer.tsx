import React, { useState, useEffect } from 'react';
import { MochiIcon } from './MochiIcon';
import { LandingMascotCanvas } from './LandingMascotCanvas';

export const Footer: React.FC = () => {
  const [currentMessageIdx, setCurrentMessageIdx] = useState(0);
  const [isFading, setIsFading] = useState(false);

  const companionMessages: Array<{
    text: string;
    state: 'idle' | 'working' | 'resting' | 'coffee';
  }> = [
    {
      text: "Logged 1 hour of focus time with you today! Great job! ⏱️",
      state: 'working'
    },
    {
      text: "Good morning! Ready for coffee & breakfast? ☕",
      state: 'coffee'
    },
    {
      text: "Remember to take a quick sip of water and stretch! 💧",
      state: 'idle'
    },
    {
      text: "You have 2 focus sessions scheduled this afternoon! 🚀",
      state: 'working'
    },
    {
      text: "Taking a quick nap while you take a break! 💤",
      state: 'resting'
    },
    {
      text: "Everything we work on stays 100% private on your PC! 🔒",
      state: 'idle'
    }
  ];

  // Auto cycle companion messages smoothly with fade animation
  useEffect(() => {
    const timer = setInterval(() => {
      setIsFading(true);
      setTimeout(() => {
        setCurrentMessageIdx((prev) => (prev + 1) % companionMessages.length);
        setIsFading(false);
      }, 250);
    }, 4500);
    return () => clearInterval(timer);
  }, []);

  const handleNextExample = () => {
    setIsFading(true);
    setTimeout(() => {
      setCurrentMessageIdx((prev) => (prev + 1) % companionMessages.length);
      setIsFading(false);
    }, 200);
  };

  const currentMessage = companionMessages[currentMessageIdx];

  return (
    <footer style={{
      position: 'relative',
      width: '100%',
      background: '#ffffff',
      color: '#0f172a',
      overflow: 'hidden',
      border: 'none',
      outline: 'none',
      paddingTop: '64px',
      paddingBottom: 0,
      marginBottom: 0
    }}>
      
      {/* 📄 TOP NAVIGATION SECTION (Clean, Unboxed, Seamless Blend) */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 32px 32px 32px', position: 'relative', zIndex: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '32px' }}>
          
          {/* Col 1: Brand & Mission */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
              <MochiIcon size={36} glow={false} />
              <span style={{ fontSize: '24px', fontWeight: '800', color: '#0f172a' }}>
                Mochi
              </span>
            </div>
            <p style={{ fontSize: '14px', color: '#475569', lineHeight: '1.6', marginBottom: '16px', maxWidth: '280px', fontWeight: '500' }}>
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
            <h4 style={{ fontSize: '13px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '16px' }}>PRODUCT</h4>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '14px', color: '#334155', fontWeight: '500' }}>
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
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '14px', color: '#334155', fontWeight: '500' }}>
              <li><a href="https://github.com/manulaWithanage/mochi-companion/blob/main/LICENSE" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>MIT Open Source License</a></li>
              <li><a href="https://github.com/manulaWithanage/mochi-companion/blob/main/LLM_ROUTER_SECURITY.md" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>Native safeStorage Vault</a></li>
              <li><a href="https://github.com/manulaWithanage/mochi-companion/blob/main/SYSTEM_ARCHITECTURE.md" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>System Architecture Specs</a></li>
              <li><a href="https://github.com/manulaWithanage/mochi-companion/blob/main/SCALING_STRATEGY.md" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>BYOK Security Model</a></li>
            </ul>
          </div>

          {/* Col 4: Community */}
          <div>
            <h4 style={{ fontSize: '13px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '16px' }}>COMMUNITY</h4>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '14px', color: '#334155', fontWeight: '500' }}>
              <li><a href="https://github.com/manulaWithanage/mochi-companion" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>GitHub Repository ⭐</a></li>
              <li><a href="https://github.com/manulaWithanage/mochi-companion/issues" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>Report an Issue / Bug</a></li>
              <li><a href="https://github.com/manulaWithanage/mochi-companion/discussions" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>Community Discussions</a></li>
              <li><a href="https://github.com/manulaWithanage/mochi-companion/blob/main/LAUNCH_PLAN.md" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>Founding Pioneer Program</a></li>
            </ul>
          </div>
        </div>

        {/* Copyright Bar (Seamless Line-Free Blend) */}
        <div style={{
          paddingTop: '20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '13px',
          color: '#64748b',
          fontWeight: '500',
          flexWrap: 'wrap',
          gap: '12px',
          border: 'none'
        }}>
          <div>
            Copyright © 2026 <strong>manulaWithanage</strong> & Mochi contributors. Built with ❤️ for developers.
          </div>
          <div>
            Released under the <strong>MIT License</strong>
          </div>
        </div>
      </div>

      {/* 🌸 BOTTOM SECTION: SILKY FEATHER-SOFT GRADIENT BLEND INTO 3D PAPERCRAFT BANNER */}
      <div style={{ position: 'relative', width: '100%', height: '540px', overflow: 'hidden', margin: 0, padding: 0 }}>
        
        {/* Silky Feather-Soft Top Gradient Transition (Zero Divide Lines!) */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '110px',
          background: 'linear-gradient(to bottom, #ffffff 0%, rgba(255, 255, 255, 0.85) 45%, transparent 100%)',
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
            objectPosition: 'center center',
            transform: 'scale(1.04) translateY(12px)',
            display: 'block',
            zIndex: 1
          }}
        />

        {/* 🍡 INTERACTIVE MOCHI MASCOT WITH AUTO-FITTING APPLE GLASSMORPHIC PILL */}
        <div
          onClick={handleNextExample}
          style={{
            position: 'absolute',
            bottom: '28px',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            zIndex: 10,
            cursor: 'pointer'
          }}
          title="Click to talk to Mochi!"
        >
          {/* Auto-Fitting Apple Liquid Glassmorphic Pill */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.85)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            color: '#0f172a',
            width: 'auto',
            maxWidth: '85vw',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '9px 20px',
            borderRadius: '24px',
            fontSize: '13px',
            fontWeight: '600',
            border: '1px solid rgba(255, 255, 255, 0.95)',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.08), inset 0 1px 2px rgba(255, 255, 255, 0.9)',
            marginBottom: '12px',
            position: 'relative',
            opacity: isFading ? 0.2 : 1,
            transform: isFading ? 'translateY(-2px)' : 'translateY(0)',
            transition: 'all 0.25s ease',
            whiteSpace: 'nowrap'
          }}>
            {currentMessage.text}
            
            {/* Glass Pointer Tail */}
            <div style={{
              position: 'absolute',
              bottom: '-6px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: 0,
              height: 0,
              borderLeft: '6px solid transparent',
              borderRight: '6px solid transparent',
              borderTop: '6px solid rgba(255, 255, 255, 0.88)'
            }}></div>
          </div>

          {/* Mascot Canvas with Clean Soft Shadow */}
          <div style={{ filter: 'drop-shadow(0 8px 14px rgba(0, 0, 0, 0.08))' }}>
            <LandingMascotCanvas state={currentMessage.state} size={135} />
          </div>
        </div>
      </div>

    </footer>
  );
};
