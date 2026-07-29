import React, { useState } from 'react';
import { LandingMascotCanvas } from './LandingMascotCanvas';
import { MochiIcon } from './MochiIcon';
import { Footer } from './Footer';

interface LandingPageProps {
  onGoToDashboard: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onGoToDashboard }) => {
  const [mascotState, setMascotState] = useState<'idle' | 'working' | 'resting' | 'coffee'>('idle');
  const [speechMessage, setSpeechMessage] = useState("Hi! I'm Mochi. I sit on your desktop to help you stay focused & calm!");
  const [clickCount, setClickCount] = useState(0);

  const handleMascotClick = () => {
    const companionQuotes = [
      "I'm keeping your workday focused, organized, and calm! 🍡",
      "Click 'Focus Time' below to see me type alongside you! ⏱️",
      "Did you take a sip of water and stretch your shoulders today? 💧",
      "Mochi is right here on your desktop whenever you need help! ⭐",
      "Great progress today! Take a quick 5-minute break when ready! 🚀"
    ];
    setClickCount((prev) => prev + 1);
    setSpeechMessage(companionQuotes[clickCount % companionQuotes.length]);
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
      setSpeechMessage("Hi! I'm Mochi. Standing by on your desktop whenever you need me!");
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
        background: 'rgba(255, 255, 255, 0.65)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
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
          <a href="#how-it-works" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '14px', fontWeight: '600' }}>How It Works</a>
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
          
          <a href="https://github.com/manulaWithanage/mochi-companion" target="_blank" rel="noreferrer" style={{
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

        {/* 📄 ONE SINGLE UNIFIED BIG FROSTED GLASS CARD HOUSING EVERYTHING */}
        <div style={{
          position: 'relative',
          zIndex: 10,
          maxWidth: '960px',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          background: 'rgba(255, 255, 255, 0.32)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRadius: '36px',
          border: '1px solid rgba(255, 255, 255, 0.18)',
          padding: '44px 48px 40px 48px',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.05), inset 0 1px 1px rgba(255, 255, 255, 0.6)'
        }}>
          
          {/* Clean Badge Pill */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 18px',
            borderRadius: '20px',
            background: 'rgba(255, 255, 255, 0.75)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(79, 70, 229, 0.18)',
            fontSize: '12.5px',
            fontWeight: '700',
            color: '#4f46e5',
            letterSpacing: '0.02em',
            marginBottom: '22px',
            boxShadow: '0 4px 14px rgba(0, 0, 0, 0.03)'
          }}>
            Super-Intelligent Desktop Workflow Companion
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
            Work feels peaceful when your <span className="gradient-text">AI companion</span> sits on your screen.
          </h1>

          <p style={{
            fontSize: '18px',
            color: '#334155',
            lineHeight: '1.6',
            marginBottom: '32px',
            fontWeight: '600',
            maxWidth: '760px',
            margin: '0 auto 32px auto'
          }}>
            Mochi lives right on your computer screen. It logs your work hours with 1 click, reminds you to drink water and enjoy breakfast, and keeps your workday calm, focused, and on schedule.
          </p>

          {/* CTA Button Row */}
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center', marginBottom: '40px' }}>
            <a href="https://github.com/manulaWithanage/mochi-companion" target="_blank" rel="noreferrer" style={{
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

          {/* 🍡 INTERACTIVE MOCHI MASCOT & PLAYGROUND INSIDE THE BIG GLASS CARD */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            paddingTop: '28px',
            borderTop: '1px solid rgba(0, 0, 0, 0.06)'
          }}>
            {/* Apple Liquid Glassmorphic Speech Bubble */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.88)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
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

            {/* Live Interactive Mascot Canvas */}
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
                Rest Mode
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

      {/* 🎯 Simple Feature Showcase Grid */}
      <section id="how-it-works" style={{ maxWidth: '1100px', margin: '0 auto', padding: '60px 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <h2 style={{ fontSize: '36px', fontWeight: '800', marginBottom: '12px', color: '#0f172a' }}>
            3 Simple Ways Mochi Makes Your Workday Better
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '16px' }}>
            No complicated settings or setup. Just a simple companion that helps you stay on track.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
          {/* Card 1 */}
          <div className="glass-card" style={{ padding: '32px' }}>
            <div style={{ fontSize: '36px', marginBottom: '16px' }}>⏱️</div>
            <h3 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '8px', color: '#0f172a' }}>1-Click Work Time Tracker</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: '1.6' }}>
              Stop filling out annoying timesheets. Click Mochi once when you start working, and Mochi types alongside you on a mini laptop to log your hours automatically.
            </p>
          </div>

          {/* Card 2 */}
          <div className="glass-card" style={{ padding: '32px' }}>
            <div style={{ fontSize: '36px', marginBottom: '16px' }}>🌅</div>
            <h3 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '8px', color: '#0f172a' }}>Daily Lifestyle & Health Nudges</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: '1.6' }}>
              Stay energized with gentle reminders for your 9:00 AM breakfast, hourly water checks, posture reminders, and evening wind-down summaries so you never burn out.
            </p>
          </div>

          {/* Card 3 */}
          <div id="privacy" className="glass-card" style={{ padding: '32px' }}>
            <div style={{ fontSize: '36px', marginBottom: '16px' }}>🔒</div>
            <h3 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '8px', color: '#0f172a' }}>100% Private & Stays on Your Machine</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: '1.6' }}>
              Your personal tasks, schedules, and work hours stay safely on your computer. Nothing is ever sold, tracked, or shared with external servers.
            </p>
          </div>
        </div>
      </section>

      {/* 🌸 3D Papercraft Origami Footer Component */}
      <Footer />

    </div>
  );
};
