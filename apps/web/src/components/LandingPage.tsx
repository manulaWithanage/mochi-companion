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
      "I log your work time in 1 click so you don't need timesheets! ⏱️",
      "Did you take a sip of water and stretch your shoulders today? 💧",
      "Mochi is right here on your desktop whenever you need help! ⭐",
      "Great progress today! Take a quick 5-minute break when ready! 🚀"
    ];
    setClickCount((prev) => prev + 1);
    setMascotState('idle');
    setSpeechMessage(companionQuotes[clickCount % companionQuotes.length]);
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-dark)', color: 'var(--text-main)', overflowX: 'hidden', position: 'relative' }}>
      
      {/* 🌐 Top Navigation Bar (Light Theme Glass) */}
      <nav style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '18px 48px',
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

      {/* 🌸 FULL VIEWPORT (100vh) 3D PAPERCRAFT HERO SECTION */}
      <section style={{
        position: 'relative',
        width: '100%',
        minHeight: 'calc(100vh - 75px)', // Industry standard 100% viewport height fill!
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px'
      }}>
        
        {/* Full-Bleed Viewport Background Artwork */}
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
            objectPosition: 'center center',
            display: 'block',
            zIndex: 1
          }}
        />

        {/* 📄 ONE SINGLE UNIFIED COMPACT CRYSTAL GLASS CARD */}
        <div style={{
          position: 'relative',
          zIndex: 10,
          maxWidth: '920px',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          background: 'rgba(255, 255, 255, 0.15)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          borderRadius: '32px',
          border: '1px solid rgba(255, 255, 255, 0.35)',
          padding: '36px 44px 28px 44px',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.05), inset 0 1px 1px rgba(255, 255, 255, 0.7)'
        }}>
          
          {/* Clean Badge Pill */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '5px 16px',
            borderRadius: '20px',
            background: 'rgba(255, 255, 255, 0.65)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(79, 70, 229, 0.25)',
            fontSize: '12px',
            fontWeight: '700',
            color: '#4f46e5',
            letterSpacing: '0.02em',
            marginBottom: '18px',
            boxShadow: '0 4px 14px rgba(0, 0, 0, 0.04)'
          }}>
            Super-Intelligent Desktop Workflow Companion
          </div>

          {/* Hero Title */}
          <h1 style={{
            fontSize: '50px',
            fontWeight: '800',
            lineHeight: '1.14',
            marginBottom: '16px',
            color: '#0f172a',
            letterSpacing: '-0.03em'
          }}>
            Work feels peaceful when your <span className="gradient-text">AI companion</span> sits on your screen.
          </h1>

          <p style={{
            fontSize: '17px',
            color: '#0f172a',
            lineHeight: '1.55',
            marginBottom: '26px',
            fontWeight: '600',
            maxWidth: '720px',
            margin: '0 auto 26px auto'
          }}>
            Mochi lives right on your computer screen. It logs your work hours with 1 click, reminds you to drink water and enjoy breakfast, and keeps your workday calm, focused, and on schedule.
          </p>

          {/* CTA Button Row */}
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center', marginBottom: '24px' }}>
            <a href="/Mochi-Setup.exe" download style={{
              padding: '13px 30px',
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
              padding: '13px 26px',
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
            marginBottom: '22px',
            color: '#0f172a',
            fontSize: '12.5px',
            fontWeight: '700'
          }}>
            <span>Windows desktop app</span>
            <span aria-hidden="true" style={{ color: '#64748b' }}>•</span>
            <span>100% Free & Open-Source</span>
            <span aria-hidden="true" style={{ color: '#64748b' }}>•</span>
            <span>Your data stays 100% local</span>
          </div>

          {/* 🍡 INTERACTIVE MOCHI MASCOT & SPEECH BUBBLE */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            paddingTop: '20px',
            borderTop: '1px solid rgba(0, 0, 0, 0.06)'
          }}>
            {/* Apple Liquid Glassmorphic Speech Bubble */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.85)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              color: '#0f172a',
              padding: '9px 20px',
              borderRadius: '24px',
              fontSize: '13px',
              fontWeight: '600',
              maxWidth: '460px',
              textAlign: 'center',
              boxShadow: '0 12px 32px rgba(0, 0, 0, 0.1), inset 0 1px 2px rgba(255, 255, 255, 0.95)',
              marginBottom: '10px',
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
            <div style={{ filter: 'drop-shadow(0 10px 20px rgba(0, 0, 0, 0.1))' }}>
              <LandingMascotCanvas
                state={mascotState}
                size={165}
                onMascotClick={handleMascotClick}
              />
            </div>
          </div>

        </div>
      </section>

      {/* 🔮 SECTION 1: WHY MOCHI EXISTS — THE CORE PHILOSOPHY */}
      <section style={{ maxWidth: '1140px', margin: '0 auto', padding: '80px 24px 40px 24px' }}>
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
            Reimagining Your Desktop Workday
          </div>
          <h2 style={{ fontSize: '42px', fontWeight: '800', marginBottom: '16px', color: '#0f172a', letterSpacing: '-0.02em' }}>
            Why We Built Mochi
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '17.5px', maxWidth: '680px', margin: '0 auto', lineHeight: '1.6' }}>
            Productivity tools shouldn’t feel like annoying managers. Mochi is designed as a calm, floating companion that makes working on your PC enjoyable.
          </p>
        </div>

        {/* Comparison Split Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '28px' }}>
          
          {/* Card 1: Traditional Apps */}
          <div style={{
            background: '#ffffff',
            borderRadius: '28px',
            padding: '36px',
            border: '1px solid #fee2e2',
            boxShadow: '0 10px 30px rgba(239, 68, 68, 0.04)'
          }}>
            <div style={{
              display: 'inline-flex',
              padding: '6px 14px',
              borderRadius: '16px',
              background: '#fef2f2',
              color: '#dc2626',
              fontSize: '12px',
              fontWeight: '800',
              marginBottom: '20px'
            }}>
              TRADITIONAL TRACKING APPS
            </div>
            <h3 style={{ fontSize: '22px', fontWeight: '700', color: '#0f172a', marginBottom: '14px' }}>
              Tedious, Intrusive & Stressful
            </h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '14.5px', color: '#64748b' }}>
              <li style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <span style={{ color: '#ef4444', fontWeight: 'bold' }}>✕</span> Complex, bloated dashboards that take minutes just to start a timer
              </li>
              <li style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <span style={{ color: '#ef4444', fontWeight: 'bold' }}>✕</span> Forgetting to take breaks, drink water, or eat breakfast while coding
              </li>
              <li style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <span style={{ color: '#ef4444', fontWeight: 'bold' }}>✕</span> Cloud tools tracking your activity and storing private data on remote servers
              </li>
            </ul>
          </div>

          {/* Card 2: The Mochi Way */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(240, 245, 255, 0.9) 0%, rgba(245, 240, 255, 0.9) 100%)',
            borderRadius: '28px',
            padding: '36px',
            border: '1px solid rgba(79, 70, 229, 0.25)',
            boxShadow: '0 12px 36px rgba(79, 70, 229, 0.08)'
          }}>
            <div style={{
              display: 'inline-flex',
              padding: '6px 14px',
              borderRadius: '16px',
              background: 'rgba(79, 70, 229, 0.12)',
              color: '#4f46e5',
              fontSize: '12px',
              fontWeight: '800',
              marginBottom: '20px'
            }}>
              THE MOCHI COMPANION EXPERIENCE
            </div>
            <h3 style={{ fontSize: '22px', fontWeight: '700', color: '#0f172a', marginBottom: '14px' }}>
              Calm, 1-Click & 100% Private
            </h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '14.5px', color: '#334155', fontWeight: '500' }}>
              <li style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <span style={{ color: '#10b981', fontWeight: 'bold' }}>✓</span> 1-Click floating stopwatch—Mochi dons glasses & types alongside you
              </li>
              <li style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <span style={{ color: '#10b981', fontWeight: 'bold' }}>✓</span> 9 AM coffee/breakfast check-ins, hydration prompts & posture resets
              </li>
              <li style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <span style={{ color: '#10b981', fontWeight: 'bold' }}>✓</span> Bring Your Own Key (BYOK) with 100% local encrypted OS safeStorage
              </li>
            </ul>
          </div>

        </div>
      </section>

      {/* 🚀 SECTION 2: 4 CORE SUPERPOWERS GRID */}
      <section id="capabilities" style={{ maxWidth: '1140px', margin: '0 auto', padding: '60px 24px 40px 24px' }}>
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
            Everyday Desktop Capabilities
          </div>
          <h2 style={{ fontSize: '40px', fontWeight: '800', marginBottom: '14px', color: '#0f172a', letterSpacing: '-0.02em' }}>
            What Mochi Does for Your Workday
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '17px', maxWidth: '680px', margin: '0 auto', lineHeight: '1.6' }}>
            Four essential workflow superpowers integrated into one delightful desktop companion.
          </p>
        </div>

        {/* 4 Feature Cards Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '24px' }}>
          
          {/* Superpower 1: 1-Click Work Stopwatch */}
          <div className="glass-card" style={{ padding: '36px', borderRadius: '28px' }}>
            <div style={{
              width: '52px',
              height: '52px',
              borderRadius: '18px',
              background: 'rgba(79, 70, 229, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '24px',
              marginBottom: '22px',
              color: '#4f46e5'
            }}>
              ⏱️
            </div>
            <h3 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '10px', color: '#0f172a' }}>1-Click Work Stopwatch</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '14.5px', lineHeight: '1.65' }}>
              No timesheets required. Click Mochi once when you start working, and Mochi dons mini glasses and types alongside you on its laptop to auto-log your work hours.
            </p>
          </div>

          {/* Superpower 2: 9 AM Lifestyle & Wellness Nudges */}
          <div className="glass-card" style={{ padding: '36px', borderRadius: '28px' }}>
            <div style={{
              width: '52px',
              height: '52px',
              borderRadius: '18px',
              background: 'rgba(245, 158, 11, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '24px',
              marginBottom: '22px',
              color: '#f59e0b'
            }}>
              ☕
            </div>
            <h3 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '10px', color: '#0f172a' }}>Lifestyle & Health Nudges</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '14.5px', lineHeight: '1.65' }}>
              Stay energized all day with 9:00 AM coffee/breakfast check-ins, hourly water prompts, shoulder stretch reminders, and evening wind-down summaries.
            </p>
          </div>

          {/* Superpower 3: BYOK AI Intelligence */}
          <div className="glass-card" style={{ padding: '36px', borderRadius: '28px' }}>
            <div style={{
              width: '52px',
              height: '52px',
              borderRadius: '18px',
              background: 'rgba(16, 185, 129, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '24px',
              marginBottom: '22px',
              color: '#10b981'
            }}>
              🤖
            </div>
            <h3 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '10px', color: '#0f172a' }}>BYOK AI Multi-Model</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '14.5px', lineHeight: '1.65' }}>
              Connect OpenAI GPT-4o, Anthropic Claude 3.5, Google Gemini, or local Ollama with your own API key. Pay pennies directly to model providers with zero markup.
            </p>
          </div>

          {/* Superpower 4: 100% Local safeStorage Vault */}
          <div className="glass-card" style={{ padding: '36px', borderRadius: '28px' }}>
            <div style={{
              width: '52px',
              height: '52px',
              borderRadius: '18px',
              background: 'rgba(14, 165, 233, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '24px',
              marginBottom: '22px',
              color: '#0ea5e9'
            }}>
              🔒
            </div>
            <h3 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '10px', color: '#0f172a' }}>100% Local Encrypted Vault</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '14.5px', lineHeight: '1.65' }}>
              Your task lists, work logs, and API keys stay encrypted locally using Windows native `safeStorage`. Zero telemetry, zero external server tracking.
            </p>
          </div>

        </div>
      </section>

      {/* 🌅 SECTION 3: A DAY IN MOCHI'S WORLD (WORKDAY TIMELINE) */}
      <section id="routine" style={{ maxWidth: '1060px', margin: '0 auto', padding: '40px 24px 80px 24px' }}>
        <div style={{
          background: 'rgba(255, 255, 255, 0.85)',
          backdropFilter: 'blur(20px)',
          borderRadius: '32px',
          padding: '48px',
          border: '1px solid rgba(0, 0, 0, 0.08)',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.04)'
        }}>
          <div style={{ textAlign: 'center', marginBottom: '44px' }}>
            <h3 style={{ fontSize: '32px', fontWeight: '800', color: '#0f172a', marginBottom: '10px' }}>
              A Peaceful Workday Timeline
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '16px' }}>
              Here is how Mochi accompanies you from morning coffee to evening wind-down.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '24px' }}>
            
            {/* Timeline Step 1 */}
            <div style={{ background: '#ffffff', padding: '24px', borderRadius: '22px', border: '1px solid #f1f5f9' }}>
              <div style={{ fontSize: '12.5px', fontWeight: '800', color: '#4f46e5', marginBottom: '8px' }}>9:00 AM</div>
              <h4 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', marginBottom: '8px' }}>Morning Kickoff ☕</h4>
              <p style={{ fontSize: '13.5px', color: '#64748b', lineHeight: '1.55', margin: 0 }}>
                Coffee check-in & picking your top 3 priority goals for the day.
              </p>
            </div>

            {/* Timeline Step 2 */}
            <div style={{ background: '#ffffff', padding: '24px', borderRadius: '22px', border: '1px solid #f1f5f9' }}>
              <div style={{ fontSize: '12.5px', fontWeight: '800', color: '#10b981', marginBottom: '8px' }}>11:30 AM</div>
              <h4 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', marginBottom: '8px' }}>Email & Follow-Ups ✉️</h4>
              <p style={{ fontSize: '13.5px', color: '#64748b', lineHeight: '1.55', margin: 0 }}>
                Gentle nudge to reply to client emails before deep focus time.
              </p>
            </div>

            {/* Timeline Step 3 */}
            <div style={{ background: '#ffffff', padding: '24px', borderRadius: '22px', border: '1px solid #f1f5f9' }}>
              <div style={{ fontSize: '12.5px', fontWeight: '800', color: '#f59e0b', marginBottom: '8px' }}>2:00 PM</div>
              <h4 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', marginBottom: '8px' }}>Deep Focus Session 💻</h4>
              <p style={{ fontSize: '13.5px', color: '#64748b', lineHeight: '1.55', margin: 0 }}>
                1-click stopwatch logs your project hours while Mochi types alongside you.
              </p>
            </div>

            {/* Timeline Step 4 */}
            <div style={{ background: '#ffffff', padding: '24px', borderRadius: '22px', border: '1px solid #f1f5f9' }}>
              <div style={{ fontSize: '12.5px', fontWeight: '800', color: '#ec4899', marginBottom: '8px' }}>5:30 PM</div>
              <h4 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', marginBottom: '8px' }}>Evening Summary 📊</h4>
              <p style={{ fontSize: '13.5px', color: '#64748b', lineHeight: '1.55', margin: 0 }}>
                Generates a clean breakdown of completed tasks & hours logged.
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* ⚙️ SECTION 4: BUILT FOR POWER USERS & PRIVACY */}
      <section id="privacy" style={{ maxWidth: '1060px', margin: '0 auto', padding: '0 24px 80px 24px' }}>
        <div style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)',
          color: '#ffffff',
          borderRadius: '32px',
          padding: '48px 56px',
          boxShadow: '0 20px 50px rgba(15, 23, 42, 0.15)'
        }}>
          <div style={{ maxWidth: '680px', marginBottom: '32px' }}>
            <span style={{ fontSize: '12px', fontWeight: '800', color: '#818cf8', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: '12px' }}>
              BUILT FOR DEVELOPERS & DESIGNERS
            </span>
            <h3 style={{ fontSize: '32px', fontWeight: '800', color: '#ffffff', marginBottom: '14px', lineHeight: '1.2' }}>
              Lightweight, Private & Open-Source Forever
            </h3>
            <p style={{ color: '#94a3b8', fontSize: '16px', lineHeight: '1.6' }}>
              Under 1% CPU usage. Mochi floats gently on top of VS Code, Figma, or your browser without slowing down your system.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' }}>
            <div style={{ background: 'rgba(255, 255, 255, 0.06)', borderRadius: '18px', padding: '20px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
              <div style={{ fontSize: '16px', fontWeight: '700', color: '#ffffff', marginBottom: '6px' }}>⚡ Less than 1% CPU</div>
              <p style={{ fontSize: '13.5px', color: '#cbd5e1', margin: 0, lineHeight: '1.5' }}>Optimized Canvas 2D engine built with electron-vite.</p>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.06)', borderRadius: '18px', padding: '20px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
              <div style={{ fontSize: '16px', fontWeight: '700', color: '#ffffff', marginBottom: '6px' }}>🔑 Zero Monthly Subscriptions</div>
              <p style={{ fontSize: '13.5px', color: '#cbd5e1', margin: 0, lineHeight: '1.5' }}>BYOK model lets you pay pennies directly to AI providers.</p>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.06)', borderRadius: '18px', padding: '20px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
              <div style={{ fontSize: '16px', fontWeight: '700', color: '#ffffff', marginBottom: '6px' }}>🎨 Custom Avatar Skins</div>
              <p style={{ fontSize: '13.5px', color: '#cbd5e1', margin: 0, lineHeight: '1.5' }}>Personalize mascot names and swap skins anytime.</p>
            </div>
          </div>
        </div>
      </section>

      {/* 🌸 3D Papercraft Origami Footer Component */}
      <Footer />

    </div>
  );
};
