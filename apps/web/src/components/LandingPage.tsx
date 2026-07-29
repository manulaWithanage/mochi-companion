import React, { useState } from 'react';
import { LandingMascotCanvas } from './LandingMascotCanvas';

interface LandingPageProps {
  onGoToDashboard: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onGoToDashboard }) => {
  const [mascotState, setMascotState] = useState<'idle' | 'working' | 'resting' | 'coffee'>('idle');
  const [speechMessage, setSpeechMessage] = useState("Hi! I'm Mochi 🍡. I live on your desktop and track your work time!");
  const [clickCount, setClickCount] = useState(0);

  const handleMascotClick = () => {
    const messages = [
      "I'm keeping your desktop cozy & productive! 🍡",
      "Ready to start a 1-click stopwatch timer? ⏱️",
      "Did you take a sip of water today? 💧",
      "Mochi loves sitting on your screen! ⭐",
      "You've been focused today! Keep it up! 🚀"
    ];
    setClickCount((prev) => prev + 1);
    setSpeechMessage(messages[clickCount % messages.length]);
  };

  const handleStateChange = (newState: 'idle' | 'working' | 'resting' | 'coffee') => {
    setMascotState(newState);
    if (newState === 'working') {
      setSpeechMessage("Timer active! Wearing my glasses & typing on my mini laptop... 👓💻");
    } else if (newState === 'resting') {
      setSpeechMessage("z Z z... Resting peacefully until you need me! 💤");
    } else if (newState === 'coffee') {
      setSpeechMessage("9:00 AM Coffee & Breakfast check-in! Stay energized! ☕");
    } else {
      setSpeechMessage("Hi! I'm Mochi 🍡. Ready to help you stay focused!");
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-dark)', color: 'var(--text-main)', overflowX: 'hidden' }}>
      
      {/* 🌐 Top Navigation Bar */}
      <nav style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '20px 48px',
        borderBottom: '1px solid var(--glass-border)',
        background: 'rgba(8, 12, 20, 0.85)',
        backdropFilter: 'blur(16px)',
        position: 'sticky',
        top: 0,
        zIndex: 100
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '32px', filter: 'drop-shadow(0 0 12px rgba(99, 102, 241, 0.6))' }}>🍡</span>
          <div>
            <span style={{ fontSize: '20px', fontWeight: '800', background: 'var(--primary-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Mochi
            </span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '8px', fontWeight: '600' }}>v0.1.0 Open-Source</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <a href="#features" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '14px', fontWeight: '500' }}>Features</a>
          <a href="#security" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '14px', fontWeight: '500' }}>BYOK Security</a>
          <a href="#github" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '14px', fontWeight: '500' }}>GitHub ⭐</a>
          
          <button onClick={onGoToDashboard} className="btn-secondary" style={{ fontSize: '13px', padding: '9px 18px' }}>
            📊 Open Cloud Dashboard
          </button>
          
          <a href="https://github.com/manulaWithanage/mochi-companion" target="_blank" rel="noreferrer" className="btn-primary" style={{ fontSize: '13px', padding: '9px 20px', textDecoration: 'none' }}>
            ⬇️ Download for Windows
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
          background: 'rgba(99, 102, 241, 0.12)',
          border: '1px solid rgba(99, 102, 241, 0.3)',
          fontSize: '13px',
          fontWeight: '600',
          color: '#818cf8',
          marginBottom: '24px'
        }}>
          ✨ Open-Source • BYOK • Desktop Companion & Time Tracker
        </div>

        {/* Hero Title */}
        <h1 style={{
          fontSize: '58px',
          fontWeight: '800',
          lineHeight: '1.15',
          maxWidth: '920px',
          marginBottom: '24px'
        }}>
          Meet <span className="gradient-text">Mochi</span>. Your Cozy Desktop AI Pet & 1-Click Time Tracker.
        </h1>

        <p style={{
          fontSize: '18px',
          color: 'var(--text-muted)',
          maxWidth: '720px',
          lineHeight: '1.6',
          marginBottom: '40px'
        }}>
          Mochi floats on your screen as an adorable animated pet. It tracks your project work time, handles your 9:00 AM breakfast and hydration routine, and keeps your schedule organized with zero telemetry.
        </p>

        {/* CTA Button Row */}
        <div style={{ display: 'flex', gap: '16px', marginBottom: '60px' }}>
          <a href="https://github.com/manulaWithanage/mochi-companion" target="_blank" rel="noreferrer" className="btn-primary" style={{ padding: '14px 28px', fontSize: '16px', textDecoration: 'none' }}>
            💾 Download Windows Installer (.exe)
          </a>
          <button onClick={onGoToDashboard} className="btn-secondary" style={{ padding: '14px 24px', fontSize: '16px' }}>
            📊 Launch Web Dashboard
          </button>
        </div>

        {/* 🎮 Interactive Live Desktop Companion Playground Frame */}
        <div className="glass-card" style={{
          width: '100%',
          maxWidth: '860px',
          padding: '32px',
          borderRadius: '24px',
          position: 'relative',
          background: 'rgba(15, 23, 42, 0.8)',
          border: '1px solid rgba(99, 102, 241, 0.25)',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5), 0 0 50px rgba(99, 102, 241, 0.15)'
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
              Mochi Desktop Overlay Demo (Click Mochi below to interact!)
            </div>
            <div style={{ fontSize: '12px', color: '#10b981', fontWeight: '600' }}>
              ● Live 8 FPS Canvas
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
            background: 'radial-gradient(circle at center, rgba(99, 102, 241, 0.08) 0%, transparent 70%)'
          }}>
            {/* Speech Bubble */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.95)',
              color: '#0f172a',
              padding: '12px 20px',
              borderRadius: '16px',
              fontSize: '14px',
              fontWeight: '600',
              maxWidth: '360px',
              textAlign: 'center',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.3)',
              marginBottom: '16px',
              position: 'relative'
            }}>
              {speechMessage}
              {/* Bubble Tail */}
              <div style={{
                position: 'absolute',
                bottom: '-8px',
                left: '50%',
                transform: 'translateX(-50%)',
                width: 0,
                height: 0,
                borderLeft: '8px solid transparent',
                borderRight: '8px solid transparent',
                borderTop: '8px solid rgba(255, 255, 255, 0.95)'
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
              🍡 Idle State
            </button>
            <button
              onClick={() => handleStateChange('working')}
              className={mascotState === 'working' ? 'btn-primary' : 'btn-secondary'}
              style={{ fontSize: '13px', padding: '8px 16px' }}
            >
              👓 Working (Stopwatch)
            </button>
            <button
              onClick={() => handleStateChange('resting')}
              className={mascotState === 'resting' ? 'btn-primary' : 'btn-secondary'}
              style={{ fontSize: '13px', padding: '8px 16px' }}
            >
              💤 Resting (Sleep)
            </button>
            <button
              onClick={() => handleStateChange('coffee')}
              className={mascotState === 'coffee' ? 'btn-primary' : 'btn-secondary'}
              style={{ fontSize: '13px', padding: '8px 16px' }}
            >
              ☕ Breakfast & Coffee
            </button>
          </div>
        </div>
      </section>

      {/* 🎯 Feature Showcase Grid */}
      <section id="features" style={{ maxWidth: '1100px', margin: '0 auto', padding: '60px 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <h2 style={{ fontSize: '36px', fontWeight: '800', marginBottom: '12px' }}>
            Built for Work-Life Balance & Effortless Focus
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '16px' }}>
            Make your desktop worth keeping open with zero distraction and zero friction.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
          <div className="glass-card" style={{ padding: '32px' }}>
            <div style={{ fontSize: '36px', marginBottom: '16px' }}>⏱️</div>
            <h3 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '8px' }}>1-Click Project Stopwatch</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: '1.6' }}>
              Click Mochi once to start tracking work on any project. Mochi dons glasses and types on a mini laptop alongside you, saving logs locally to <code style={{ color: '#818cf8' }}>better-sqlite3</code>.
            </p>
          </div>

          <div className="glass-card" style={{ padding: '32px' }}>
            <div style={{ fontSize: '36px', marginBottom: '16px' }}>🌅</div>
            <h3 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '8px' }}>Daily Lifestyle Rhythm</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: '1.6' }}>
              9:00 AM breakfast reminders, gentle hourly hydration prompts, posture checks, and evening work-wind-down summaries so you never burn out.
            </p>
          </div>

          <div className="glass-card" style={{ padding: '32px' }}>
            <div style={{ fontSize: '36px', marginBottom: '16px' }}>🔑</div>
            <h3 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '8px' }}>100% BYOK & Local Security</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: '1.6' }}>
              Bring your own keys for OpenAI, Gemini, Claude, or local Ollama. All credentials are encrypted locally in Windows DPAPI / Mac Keychain using Electron's native <code style={{ color: '#a855f7' }}>safeStorage</code>.
            </p>
          </div>
        </div>
      </section>

      {/* 📄 Footer */}
      <footer style={{
        borderTop: '1px solid var(--glass-border)',
        padding: '40px 24px',
        textAlign: 'center',
        color: 'var(--text-subtle)',
        fontSize: '13px',
        background: 'rgba(8, 12, 20, 0.95)'
      }}>
        <div style={{ marginBottom: '12px', fontSize: '24px' }}>🍡</div>
        <p style={{ marginBottom: '8px' }}>
          Mochi is released under the <strong>MIT License</strong>. Free and open-source forever.
        </p>
        <p>Copyright © 2026 manulaWithanage & Mochi contributors.</p>
      </footer>
    </div>
  );
};
