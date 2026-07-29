import React, { useState, useEffect } from 'react';
import { LandingMascotCanvas } from './LandingMascotCanvas';
import { MochiIcon } from './MochiIcon';
import { Footer } from './Footer';

interface LandingPageProps {
  onGoToDashboard: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onGoToDashboard }) => {
  // Initial default state is peaceful resting/sleeping ( ^_^ ) z Z
  const [mascotState, setMascotState] = useState<'idle' | 'working' | 'resting' | 'coffee'>('resting');
  const [speechMessage, setSpeechMessage] = useState("z Z z... Resting quietly until you scroll or click! 💤");
  const [clickCount, setClickCount] = useState(0);

  // Wakes Mochi up on page scroll, then softly drifts back to sleep after 4s idle
  useEffect(() => {
    let scrollTimeout: NodeJS.Timeout;
    
    const handleScroll = () => {
      setMascotState((prev) => {
        if (prev === 'resting') {
          setSpeechMessage("Oh! You're here! Ready to focus together? 🍡");
          return 'idle';
        }
        return prev;
      });

      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        setMascotState('resting');
        setSpeechMessage("z Z z... Drifting off to sleep until you need me! 💤");
      }, 4500);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      clearTimeout(scrollTimeout);
    };
  }, []);

  const handleMascotClick = () => {
    const companionQuotes = [
      "Oh! You clicked me! Ready to focus together? 🍡",
      "Click 'Focus Time' below to see me type on my mini laptop! ⏱️",
      "Did you take a sip of water and stretch your shoulders today? 💧",
      "Mochi is right here on your desktop whenever you need help! ⭐",
      "Great progress today! Take a quick 5-minute break when ready! 🚀"
    ];
    setClickCount((prev) => prev + 1);
    setMascotState('idle');
    setSpeechMessage(companionQuotes[clickCount % companionQuotes.length] ?? companionQuotes[0]!);
  };

  const handleStateChange = (newState: 'idle' | 'working' | 'resting' | 'coffee') => {
    setMascotState(newState);
    if (newState === 'working') {
      setSpeechMessage("Work timer started! Typing alongside you on my mini laptop... 💻");
    } else if (newState === 'resting') {
      setSpeechMessage("Taking a quiet little nap while you take your break! 💤");
    } else if (newState === 'coffee') {
      setSpeechMessage("9:00 AM Check-in: Time for coffee & a healthy breakfast! ☕");
    } else {
      setSpeechMessage("Standing by on your desktop whenever you need me! 🍡");
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-dark)', color: 'var(--text-main)', overflowX: 'hidden', position: 'relative' }}>
      
      {/* 🌐 Top Navigation Bar (Light Theme Glass) */}
      <nav style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '20px 48px',
        borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
        background: 'rgba(255, 255, 255, 0.45)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        position: 'sticky',
        top: 0,
        zIndex: 100
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <MochiIcon size={34} glow={false} />
          <div>
            <span style={{ fontSize: '20px', fontWeight: '800', background: 'var(--primary-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Mochi
            </span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '8px', fontWeight: '600' }}>Desktop Companion</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '28px' }}>
          <a href="#capabilities" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '14px', fontWeight: '600' }}>Capabilities</a>
          <a href="#routine" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '14px', fontWeight: '600' }}>Daily Habits</a>
          <a href="#privacy" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '14px', fontWeight: '600' }}>100% Private</a>
          
          <button onClick={onGoToDashboard} style={{
            fontSize: '13.5px',
            fontWeight: '600',
            padding: '9px 20px',
            borderRadius: '20px',
            background: 'rgba(255, 255, 255, 0.85)',
            border: '1px solid rgba(0, 0, 0, 0.1)',
            color: '#0f172a',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.03)'
          }}>
            Explore Dashboard
          </button>
          
          <a href="/Mochi-Setup.exe" download style={{
            fontSize: '13.5px',
            fontWeight: '700',
            padding: '9px 22px',
            borderRadius: '20px',
            background: 'var(--primary-gradient)',
            color: '#ffffff',
            textDecoration: 'none',
            boxShadow: '0 4px 16px rgba(79, 70, 229, 0.3)'
          }}>
            Download for Windows
          </a>
        </div>
      </nav>

      {/* 🌸 FULL-BLEED 100% SCREEN WIDTH 3D PAPERCRAFT HERO SECTION */}
      <section style={{
        position: 'relative',
        width: '100%',
        minHeight: '820px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 24px'
      }}>
        
        {/* Full-Bleed 100% Screen Width Background Artwork (Zero Left/Right White Bars!) */}
        <img
          src="/hero_papercraft_art.jpg"
          alt="Mochi 3D Papercraft Origami Hero Background Art"
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

        {/* 📄 ONE SINGLE UNIFIED CRYSTAL GLASS CARD (Ultra Translucent 0.15 Opacity) */}
        <div style={{
          position: 'relative',
          zIndex: 10,
          maxWidth: '960px',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          background: 'rgba(255, 255, 255, 0.24)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          borderRadius: '36px',
          border: '1px solid rgba(255, 255, 255, 0.35)',
          padding: '44px 48px 40px 48px',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.05), inset 0 1px 1px rgba(255, 255, 255, 0.7)'
        }}>
          
          {/* Clean Badge Pill */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 18px',
            borderRadius: '20px',
            background: 'rgba(255, 255, 255, 0.65)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(79, 70, 229, 0.25)',
            fontSize: '12.5px',
            fontWeight: '700',
            color: '#4f46e5',
            letterSpacing: '0.02em',
            marginBottom: '22px',
            boxShadow: '0 4px 14px rgba(0, 0, 0, 0.04)'
          }}>
            A calm desktop companion
          </div>

          {/* Hero Title */}
          <h1 style={{
            fontSize: '54px',
            fontWeight: '800',
            lineHeight: '1.14',
            marginBottom: '20px',
            color: '#0f172a',
            letterSpacing: '-0.03em'
          }}>
            Work feels calmer with a <span className="gradient-text">companion</span> on your desktop.
          </h1>

          <p style={{
            fontSize: '18px',
            color: '#0f172a',
            lineHeight: '1.6',
            marginBottom: '32px',
            fontWeight: '600',
            maxWidth: '760px',
            margin: '0 auto 32px auto'
          }}>
            Start focus time in one click, build gentle routines, and keep a simple record of where your day went—without accounts, ads, or noise.
          </p>

          {/* CTA Button Row */}
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center', marginBottom: '40px' }}>
            <a href="/Mochi-Setup.exe" download style={{
              padding: '14px 32px',
              fontSize: '15px',
              fontWeight: '700',
              borderRadius: '30px',
              background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
              color: '#ffffff',
              textDecoration: 'none',
              boxShadow: '0 10px 28px rgba(79, 70, 229, 0.35)',
              display: 'inline-flex',
              alignItems: 'center'
            }}>
              Download Free for Windows
            </a>

            <button onClick={onGoToDashboard} style={{
              padding: '14px 28px',
              fontSize: '15px',
              fontWeight: '700',
              borderRadius: '30px',
              background: 'rgba(255, 255, 255, 0.85)',
              border: '1px solid rgba(0, 0, 0, 0.1)',
              color: '#0f172a',
              cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.04)'
            }}>
              Explore Web Dashboard
            </button>
          </div>

          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: '10px 18px',
            marginBottom: '28px',
            color: '#334155',
            fontSize: '13px',
            fontWeight: '700'
          }}>
            <span>Windows desktop app</span>
            <span aria-hidden="true" style={{ color: '#94a3b8' }}>•</span>
            <span>No account required</span>
            <span aria-hidden="true" style={{ color: '#94a3b8' }}>•</span>
            <span>Your data stays local</span>
          </div>

          {/* 🍡 INTERACTIVE MOCHI MASCOT & PLAYGROUND INSIDE THE BIG GLASS CARD */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
          paddingTop: '24px',
            borderTop: '1px solid rgba(0, 0, 0, 0.06)'
          }}>
            {/* Apple Liquid Glassmorphic Speech Bubble */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.85)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              color: '#0f172a',
              padding: '10px 22px',
              borderRadius: '24px',
              fontSize: '13.5px',
              fontWeight: '600',
              maxWidth: '480px',
              textAlign: 'center',
              boxShadow: '0 12px 32px rgba(0, 0, 0, 0.1), inset 0 1px 2px rgba(255, 255, 255, 0.95)',
              marginBottom: '14px',
              position: 'relative',
              border: '1px solid rgba(255, 255, 255, 0.95)'
            }}>
              {speechMessage}
              {/* Pointer Tail */}
              <div style={{
                position: 'absolute',
                bottom: '-6px',
                left: '50%',
                transform: 'translateX(-50%)',
                width: 0,
                height: 0,
                borderLeft: '6px solid transparent',
                borderRight: '6px solid transparent',
                borderTop: '6px solid rgba(255, 255, 255, 0.9)'
              }}></div>
            </div>

            {/* Live Interactive Mascot Canvas (Starts Sleeping ( ^_^ ) z Z) */}
            <div style={{ filter: 'drop-shadow(0 12px 24px rgba(0, 0, 0, 0.12))', marginBottom: '20px' }}>
              <LandingMascotCanvas
                state={mascotState}
                size={185}
                onMascotClick={handleMascotClick}
              />
            </div>

            {/* Interactive Mode Switcher Pills */}
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              gap: '10px',
              flexWrap: 'wrap'
            }}>
              <button
                onClick={() => handleStateChange('idle')}
                style={{
                  fontSize: '13px',
                  fontWeight: '600',
                  padding: '9px 20px',
                  borderRadius: '24px',
                  border: 'none',
                  cursor: 'pointer',
                  background: mascotState === 'idle' ? 'var(--primary-gradient)' : 'rgba(255, 255, 255, 0.85)',
                  color: mascotState === 'idle' ? '#ffffff' : '#334155',
                  boxShadow: mascotState === 'idle' ? '0 4px 16px rgba(79, 70, 229, 0.35)' : '0 2px 8px rgba(0,0,0,0.06)'
                }}
              >
                Standing By
              </button>
              <button
                onClick={() => handleStateChange('working')}
                style={{
                  fontSize: '13px',
                  fontWeight: '600',
                  padding: '9px 20px',
                  borderRadius: '24px',
                  border: 'none',
                  cursor: 'pointer',
                  background: mascotState === 'working' ? 'var(--primary-gradient)' : 'rgba(255, 255, 255, 0.85)',
                  color: mascotState === 'working' ? '#ffffff' : '#334155',
                  boxShadow: mascotState === 'working' ? '0 4px 16px rgba(79, 70, 229, 0.35)' : '0 2px 8px rgba(0,0,0,0.06)'
                }}
              >
                Focus Time (Stopwatch)
              </button>
              <button
                onClick={() => handleStateChange('resting')}
                style={{
                  fontSize: '13px',
                  fontWeight: '600',
                  padding: '9px 20px',
                  borderRadius: '24px',
                  border: 'none',
                  cursor: 'pointer',
                  background: mascotState === 'resting' ? 'var(--primary-gradient)' : 'rgba(255, 255, 255, 0.85)',
                  color: mascotState === 'resting' ? '#ffffff' : '#334155',
                  boxShadow: mascotState === 'resting' ? '0 4px 16px rgba(79, 70, 229, 0.35)' : '0 2px 8px rgba(0,0,0,0.06)'
                }}
              >
                Rest Mode (Sleeping)
              </button>
              <button
                onClick={() => handleStateChange('coffee')}
                style={{
                  fontSize: '13px',
                  fontWeight: '600',
                  padding: '9px 20px',
                  borderRadius: '24px',
                  border: 'none',
                  cursor: 'pointer',
                  background: mascotState === 'coffee' ? 'var(--primary-gradient)' : 'rgba(255, 255, 255, 0.85)',
                  color: mascotState === 'coffee' ? '#ffffff' : '#334155',
                  boxShadow: mascotState === 'coffee' ? '0 4px 14px rgba(79, 70, 229, 0.35)' : '0 2px 8px rgba(0,0,0,0.06)'
                }}
              >
                9 AM Coffee & Habit
              </button>
            </div>
          </div>

        </div>
      </section>

      {/* 🚀 CAPABILITIES SECTION: WHAT MOCHI CAN DO (6 FEATURES GRID) */}
      <section id="capabilities" style={{ maxWidth: '1140px', margin: '0 auto', padding: '80px 24px 40px 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: '56px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 16px',
            borderRadius: '20px',
            background: 'rgba(79, 70, 229, 0.08)',
            border: '1px solid rgba(79, 70, 229, 0.18)',
            fontSize: '12.5px',
            fontWeight: '700',
            color: '#4f46e5',
            marginBottom: '16px'
          }}>
            Built for today, growing thoughtfully
          </div>
          <h2 style={{ fontSize: '40px', fontWeight: '800', marginBottom: '14px', color: '#0f172a', letterSpacing: '-0.02em' }}>
            What Mochi Helps You Do
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '17px', maxWidth: '680px', margin: '0 auto', lineHeight: '1.6' }}>
            Mochi starts with a quiet desktop companion and one-click focus tracking. Optional routines and integrations are added only when you choose them.
          </p>
        </div>

        {/* 6 Feature Cards Grid (3 Columns x 2 Rows) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
          
          {/* Feature 1: Desktop companion */}
          <div className="glass-card" style={{ padding: '32px', borderRadius: '24px' }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '16px',
              background: 'rgba(79, 70, 229, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '22px',
              marginBottom: '20px',
              color: '#4f46e5'
            }}>
              🍡
            </div>
            <h3 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '10px', color: '#0f172a' }}>A Quiet Desktop Companion</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '14.5px', lineHeight: '1.6' }}>
              Mochi lives quietly on your desktop, ready when you want a little encouragement or a simple action.
            </p>
          </div>

          {/* Feature 2: One-click focus tracking */}
          <div className="glass-card" style={{ padding: '32px', borderRadius: '24px' }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '16px',
              background: 'rgba(16, 185, 129, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '22px',
              marginBottom: '20px',
              color: '#10b981'
            }}>
              ⏱️
            </div>
            <h3 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '10px', color: '#0f172a' }}>One-Click Focus Time</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '14.5px', lineHeight: '1.6' }}>
              Start and stop a project timer with one click, so your work hours are captured without a bulky timesheet.
            </p>
          </div>

          {/* Feature 3: Smart Routine & Health Nudges */}
          <div className="glass-card" style={{ padding: '32px', borderRadius: '24px' }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '16px',
              background: 'rgba(245, 158, 11, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '22px',
              marginBottom: '20px',
              color: '#f59e0b'
            }}>
              ☕
            </div>
            <h3 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '10px', color: '#0f172a' }}>Gentle, Optional Routines</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '14.5px', lineHeight: '1.6' }}>
              Set the moments that help you feel good: a morning check-in, a break, hydration, or a gentle wind-down.
            </p>
          </div>

          {/* Feature 4: Customizable appearance */}
          <div className="glass-card" style={{ padding: '32px', borderRadius: '24px' }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '16px',
              background: 'rgba(236, 72, 153, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '22px',
              marginBottom: '20px',
              color: '#ec4899'
            }}>
              🎨
            </div>
            <h3 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '10px', color: '#0f172a' }}>Make Mochi Yours</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '14.5px', lineHeight: '1.6' }}>
              Pick a look and personality that belongs in your workspace—Mochi should feel like your companion, not another tool.
            </p>
          </div>

          {/* Feature 5: Private by default */}
          <div className="glass-card" style={{ padding: '32px', borderRadius: '24px' }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '16px',
              background: 'rgba(139, 92, 246, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '22px',
              marginBottom: '20px',
              color: '#8b5cf6'
            }}>
              🔒
            </div>
            <h3 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '10px', color: '#0f172a' }}>Private by Default</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '14.5px', lineHeight: '1.6' }}>
              Your focus sessions, settings, and routines stay on your computer. No account is required to get started.
            </p>
          </div>

          {/* Feature 6: Optional integrations */}
          <div className="glass-card" style={{ padding: '32px', borderRadius: '24px' }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '16px',
              background: 'rgba(14, 165, 233, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '22px',
              marginBottom: '20px',
              color: '#0ea5e9'
            }}>
              ✨
            </div>
            <h3 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '10px', color: '#0f172a' }}>Optional, Thoughtful Growth</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '14.5px', lineHeight: '1.6' }}>
              Future connections and AI features will be opt-in, so Mochi stays useful without becoming noisy or invasive.
            </p>
          </div>

        </div>
      </section>

      {/* 🌅 DAILY WORKDAY ROUTINE TIMELINE */}
      <section id="routine" style={{ maxWidth: '1000px', margin: '0 auto', padding: '40px 24px 80px 24px' }}>
        <div style={{
          background: 'rgba(255, 255, 255, 0.75)',
          backdropFilter: 'blur(20px)',
          borderRadius: '32px',
          padding: '48px',
          border: '1px solid rgba(0, 0, 0, 0.08)',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.04)'
        }}>
          <div style={{ textAlign: 'center', marginBottom: '40px' }}>
            <h3 style={{ fontSize: '28px', fontWeight: '800', color: '#0f172a', marginBottom: '10px' }}>
              Your Rhythm, Not a Fixed Schedule
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '15.5px' }}>
              These are examples—choose the moments that make your workday feel more manageable.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '18px' }}>
            {/* Step 1 */}
            <div style={{ background: '#ffffff', padding: '22px', borderRadius: '20px', border: '1px solid #f1f5f9' }}>
              <div style={{ fontSize: '13px', fontWeight: '700', color: '#4f46e5', marginBottom: '8px' }}>MORNING</div>
              <h4 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', marginBottom: '6px' }}>Morning Kickoff</h4>
              <p style={{ fontSize: '13.5px', color: '#64748b', lineHeight: '1.5', margin: 0 }}>
                Start gently with a coffee check-in and the one thing you want to move forward.
              </p>
            </div>

            {/* Step 2 */}
            <div style={{ background: '#ffffff', padding: '22px', borderRadius: '20px', border: '1px solid #f1f5f9' }}>
              <div style={{ fontSize: '13px', fontWeight: '700', color: '#10b981', marginBottom: '8px' }}>BEFORE DEEP WORK</div>
              <h4 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', marginBottom: '6px' }}>Clear the Small Things</h4>
              <p style={{ fontSize: '13.5px', color: '#64748b', lineHeight: '1.5', margin: 0 }}>
                Make space for focus by handling the little tasks you decide deserve attention.
              </p>
            </div>

            {/* Step 3 */}
            <div style={{ background: '#ffffff', padding: '22px', borderRadius: '20px', border: '1px solid #f1f5f9' }}>
              <div style={{ fontSize: '13px', fontWeight: '700', color: '#f59e0b', marginBottom: '8px' }}>FOCUS SESSION</div>
              <h4 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', marginBottom: '6px' }}>Start the Stopwatch</h4>
              <p style={{ fontSize: '13.5px', color: '#64748b', lineHeight: '1.5', margin: 0 }}>
                Start a simple timer and let Mochi keep an honest record of your time.
              </p>
            </div>

            {/* Step 4 */}
            <div style={{ background: '#ffffff', padding: '22px', borderRadius: '20px', border: '1px solid #f1f5f9' }}>
              <div style={{ fontSize: '13px', fontWeight: '700', color: '#ec4899', marginBottom: '8px' }}>WIND-DOWN</div>
              <h4 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', marginBottom: '6px' }}>Close the Day Gently</h4>
              <p style={{ fontSize: '13.5px', color: '#64748b', lineHeight: '1.5', margin: 0 }}>
                Take a pause, see where your time went, and leave work with a clearer head.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 🌸 3D Papercraft Origami Footer Component */}
      <Footer />

    </div>
  );
};
