import React, { useState } from 'react';
import { LandingMascotCanvas } from './LandingMascotCanvas';

type HeroMode = 'idle' | 'working' | 'resting';

const modeDetails: Record<HeroMode, { label: string; message: string; status: string }> = {
  idle: {
    label: 'Ready',
    message: 'I am here whenever you are ready. 🍡',
    status: 'A quiet moment on your desktop'
  },
  working: {
    label: 'Focus',
    message: 'Focus timer is running. I will keep time for you. ⏱️',
    status: 'Focus session · 00:42:18'
  },
  resting: {
    label: 'Rest',
    message: 'A little pause can make room for good work. 💤',
    status: 'Resting quietly nearby'
  }
};

export const HeroDiorama: React.FC = () => {
  const [mode, setMode] = useState<HeroMode>('idle');
  const detail = modeDetails[mode];

  return (
    <section className="hero-diorama" aria-labelledby="hero-title">
      <img
        className="hero-diorama__art"
        src="/hero_papercraft_art_v2.png"
        alt=""
        aria-hidden="true"
      />
      <span className="hero-diorama__mist hero-diorama__mist--one" aria-hidden="true" />
      <span className="hero-diorama__mist hero-diorama__mist--two" aria-hidden="true" />

      <div className="hero-diorama__content">
        <p className="hero-diorama__eyebrow">YOUR PRIVATE DESKTOP COMPANION</p>
        <h1 id="hero-title">A calmer way to keep time.</h1>
        <p className="hero-diorama__description">
          Mochi lives quietly on your desktop. Start focus time in one click,
          keep a simple record of your day, and take breaks on your terms.
        </p>
        <div className="hero-diorama__actions">
          <a className="hero-diorama__download" href="/Mochi-Setup.exe" download>
            Download for Windows
          </a>
          <a className="hero-diorama__link" href="#capabilities">
            See how Mochi helps <span aria-hidden="true">↓</span>
          </a>
        </div>
        <p className="hero-diorama__trust">Windows desktop app <span>•</span> No account required <span>•</span> Data stays local</p>
      </div>

      <div className="hero-diorama__demo" aria-label="Interactive Mochi preview">
        <div className="hero-diorama__window">
          <div className="hero-diorama__window-bar">
            <span className="hero-diorama__window-app"><span className="hero-diorama__window-app-dot" aria-hidden="true" /> Mochi</span>
            <span>Quietly nearby</span>
            <span className="hero-diorama__live">● Live</span>
          </div>
          <div className="hero-diorama__window-scene">
            <div className="hero-diorama__speech" aria-live="polite">
              {detail.message}
              <span aria-hidden="true" />
            </div>
            <div className="hero-diorama__mascot">
              <LandingMascotCanvas state={mode} size={205} />
            </div>
            <div className="hero-diorama__status">
              <span className={mode === 'working' ? 'hero-diorama__status-dot hero-diorama__status-dot--active' : 'hero-diorama__status-dot'} />
              {detail.status}
            </div>
          </div>
          <div className="hero-diorama__window-footer">
            <div className="hero-diorama__mode-picker" aria-label="Preview Mochi states">
              {(Object.keys(modeDetails) as HeroMode[]).map((item) => (
                <button
                  className={mode === item ? 'is-active' : undefined}
                  key={item}
                  onClick={() => setMode(item)}
                  type="button"
                >
                  {modeDetails[item].label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <a className="hero-diorama__scroll" href="#capabilities">
        Explore Mochi <span aria-hidden="true">↓</span>
      </a>
    </section>
  );
};
