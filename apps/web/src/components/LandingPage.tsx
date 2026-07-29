import React, { useState } from 'react';
import { LandingMascotCanvas } from './LandingMascotCanvas';
import { MochiIcon } from './MochiIcon';
import { Footer } from './Footer';

interface LandingPageProps {
  onGoToDashboard: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onGoToDashboard }) => {
  const [mascotState, setMascotState] = useState<'idle' | 'working' | 'resting' | 'coffee'>('idle');
  const [speechMessage, setSpeechMessage] = useState("Hi there! I'm Mochi. I sit on your screen to help you stay focused & track your work!");
  const [clickCount, setClickCount] = useState(0);

  const handleMascotClick = () => {
    const messages = [
      "I'm keeping your workday calm, focused, and organized! 🍡",
      "Ready to start working? Click below to start the timer! ⏱️",
      "Did you take a sip of water and stretch your shoulders today? 💧",
      "Mochi is right here on your desktop whenever you need help! ⭐",
      "Great focus today! Take a quick 5-minute break when you can! 🚀"
    ];
    setClickCount((prev) => prev + 1);
    setSpeechMessage(messages[clickCount % messages.length]);
  };

  const handleStateChange = (newState: 'idle' | 'working' | 'resting' | 'coffee') => {
    setMascotState(newState);
    if (newState === 'working') {
      setSpeechMessage("Work timer started! Wearing my glasses and typing alongside you... 👓💻");
    } else if (newState === 'resting') {
      setSpeechMessage("z Z z... Resting quietly until you're ready for your next task! 💤");
    } else if (newState === 'coffee') {
      setSpeechMessage("9:00 AM Check-in: Time for a healthy breakfast & morning coffee! ☕");
    } else {
      setSpeechMessage("Hi there! I'm Mochi. Standing by whenever you need me!");
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-dark)', color: 'var(--text-main)', overflowX: 'hidden' }}>
      
      {/* 🌐 Top Navigation Bar (Light Mode) */}
      <nav style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '20px 48px',
        borderBottom: '1px solid var(--glass-border)',
        background: 'rgba(255, 255, 255, 0.85)',
        backdropFilter: 'blur(16px)',
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

        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <a href="#how-it-works" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '14px', fontWeight: '600' }}>How It Works</a>
          <a href="#routine" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '14px', fontWeight: '600' }}>Daily Habits</a>
          <a href="#privacy" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '14px', fontWeight: '600' }}>100% Private</a>
          
          <button onClick={onGoToDashboard} className="btn-secondary" style={{ fontSize: '13px', padding: '9px 18px' }}>
            📊 Open Web Dashboard
          </button>
          
          <a href="https://github.com/manulaWithanage/mochi-companion" target="_blank" rel="noreferrer" className="btn-primary" style={{ fontSize: '13px', padding: '9px 20px', textDecoration: 'none' }}>
            ⬇️ Download Free for Windows
          </a>
        </div>
      </nav>

      {/* 🚀 Hero Section */}
      <section style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '80px 24px 60px 24px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center'
      }}>
        {/* Badge Pill */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 18px',
          borderRadius: '20px',
          background: 'rgba(79, 70, 229, 0.08)',
          border: '1px solid rgba(79, 70, 229, 0.2)',
          fontSize: '13px',
          fontWeight: '700',
          color: '#4f46e5',
          marginBottom: '24px'
        }}>
          <MochiIcon size={18} glow={false} /> Meet Your New Friendly Desktop Companion
        </div>

        {/* Hero Title */}
        <h1 style={{
          fontSize: '58px',
          fontWeight: '800',
          lineHeight: '1.15',
          maxWidth: '920px',
          marginBottom: '24px'
        }}>
          Work feels easier when you have a <span className="gradient-text">smart companion</span> on your screen.
        </h1>

        <p style={{
          fontSize: '19px',
          color: 'var(--text-muted)',
          maxWidth: '740px',
          lineHeight: '1.6',
          marginBottom: '40px'
        }}>
          Mochi is a friendly little assistant that lives right on your computer screen. It tracks your work hours with one click, reminds you to eat breakfast and stay hydrated, and keeps your workday calm, organized, and on schedule.
        </p>

        {/* CTA Button Row */}
        <div style={{ display: 'flex', gap: '16px', marginBottom: '60px' }}>
          <a href="https://github.com/manulaWithanage/mochi-companion" target="_blank" rel="noreferrer" className="btn-primary" style={{ padding: '14px 28px', fontSize: '16px', textDecoration: 'none' }}>
            💾 Download for Windows (Free)
          </a>
          <button onClick={onGoToDashboard} className="btn-secondary" style={{ padding: '14px 24px', fontSize: '16px' }}>
            📊 Explore Web Dashboard
          </button>
        </div>

        {/* 🎮 Interactive Live Desktop Companion Playground Frame */}
        <div className="glass-card" style={{
          width: '100%',
          maxWidth: '860px',
          padding: '32px',
          borderRadius: '24px',
          position: 'relative',
          background: 'rgba(255, 255, 255, 0.9)',
          border: '1px solid rgba(0, 0, 0, 0.08)',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.06)'
        }}>
          {/* Simulated Desktop Bar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingBottom: '16px',
            borderBottom: '1px solid var(--glass-border)',
            marginBottom: '24px'
          }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#ef4444' }}></div>
              <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#f59e0b' }}></div>
              <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#10b981' }}></div>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-subtle)', fontWeight: '600' }}>
              Live Interactive Demo — Click Mochi on screen to test how it helps you!
            </div>
            <div style={{ fontSize: '12px', color: '#059669', fontWeight: '700' }}>
              ● Active on Desktop
            </div>
          </div>

          {/* Interactive Mascot Stage */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '260px',
            position: 'relative',
            background: 'radial-gradient(circle at center, rgba(79, 70, 229, 0.05) 0%, transparent 70%)'
          }}>
            {/* Speech Bubble */}
            <div style={{
              background: '#ffffff',
              color: '#0f172a',
              padding: '12px 20px',
              borderRadius: '16px',
              fontSize: '14px',
              fontWeight: '600',
              maxWidth: '380px',
              textAlign: 'center',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.08)',
              marginBottom: '16px',
              position: 'relative',
              border: '1px solid #e2e8f0'
            }}>
              {speechMessage}
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

            {/* Interactive Live Mascot Canvas */}
            <LandingMascotCanvas
              state={mascotState}
              size={180}
              onMascotClick={handleMascotClick}
            />
          </div>

          {/* State Switcher Buttons */}
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '12px',
            marginTop: '20px',
            paddingTop: '20px',
            borderTop: '1px solid var(--glass-border)',
            flexWrap: 'wrap'
          }}>
            <button
              onClick={() => handleStateChange('idle')}
              className={mascotState === 'idle' ? 'btn-primary' : 'btn-secondary'}
              style={{ fontSize: '13px', padding: '8px 16px' }}
            >
              🍡 Standing By
            </button>
            <button
              onClick={() => handleStateChange('working')}
              className={mascotState === 'working' ? 'btn-primary' : 'btn-secondary'}
              style={{ fontSize: '13px', padding: '8px 16px' }}
            >
              👓 Work Timer Active
            </button>
            <button
              onClick={() => handleStateChange('resting')}
              className={mascotState === 'resting' ? 'btn-primary' : 'btn-secondary'}
              style={{ fontSize: '13px', padding: '8px 16px' }}
            >
              💤 Rest Mode
            </button>
            <button
              onClick={() => handleStateChange('coffee')}
              className={mascotState === 'coffee' ? 'btn-primary' : 'btn-secondary'}
              style={{ fontSize: '13px', padding: '8px 16px' }}
            >
              ☕ 9 AM Breakfast Reminder
            </button>
          </div>
        </div>
      </section>

      {/* 🎯 Simple Feature Showcase Grid */}
      <section id="how-it-works" style={{ maxWidth: '1100px', margin: '0 auto', padding: '60px 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <h2 style={{ fontSize: '36px', fontWeight: '800', marginBottom: '12px' }}>
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
            <h3 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '8px' }}>1-Click Work Time Tracker</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: '1.6' }}>
              Stop filling out annoying timesheets. Click Mochi once when you start working, and Mochi puts on mini glasses and types alongside you on a mini laptop to log your hours automatically.
            </p>
          </div>

          {/* Card 2 */}
          <div className="glass-card" style={{ padding: '32px' }}>
            <div style={{ fontSize: '36px', marginBottom: '16px' }}>🌅</div>
            <h3 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '8px' }}>Daily Lifestyle & Health Nudges</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: '1.6' }}>
              Stay energized with gentle reminders for your 9:00 AM breakfast, hourly water checks, posture reminders, and evening wind-down summaries so you never burn out.
            </p>
          </div>

          {/* Card 3 */}
          <div id="privacy" className="glass-card" style={{ padding: '32px' }}>
            <div style={{ fontSize: '36px', marginBottom: '16px' }}>🔒</div>
            <h3 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '8px' }}>100% Private & Stays on Your Machine</h3>
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
