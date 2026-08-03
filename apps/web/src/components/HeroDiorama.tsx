import React, { useState } from 'react';

type HeroMode = 'idle' | 'working' | 'resting';

const modes: Record<
  HeroMode,
  { label: string; message: string; focus: string; action: string; completed: string }
> = {
  idle: {
    label: 'Ready',
    message: 'Your next focus block starts when you are ready.',
    focus: '2h 35m',
    action: 'Start a 25-minute focus',
    completed: '2',
  },
  working: {
    label: 'Focus',
    message: 'Keeping time while you finish the landing page.',
    focus: '3h 00m',
    action: 'Focus session · 25:00',
    completed: '3',
  },
  resting: {
    label: 'Rest',
    message: 'A five-minute pause before the next small step.',
    focus: '3h 00m',
    action: 'Rest until 11:40 AM',
    completed: '3',
  },
};

export const HeroDiorama: React.FC = () => {
  const [mode, setMode] = useState<HeroMode>('idle');
  const detail = modes[mode];

  return (
    <section className="hero-diorama hero-sanctuary" aria-labelledby="hero-title">
      <div className="hero-sanctuary__halo" aria-hidden="true" />

      <div className="hero-sanctuary__intro">
        <p className="hero-sanctuary__eyebrow">PRIVATE DESKTOP COMPANION</p>
        <h1 id="hero-title">The little companion that keeps your day together.</h1>
        <p>
          See today’s plan, important emails, tasks, focus time, and gentle reminders in one calm
          space on your computer.
        </p>
        <div className="hero-sanctuary__actions">
          <a href="/Mochi-Setup.exe" download>
            Download for Windows
          </a>
          <a href="#your-day">
            See how Mochi helps <span aria-hidden="true">↓</span>
          </a>
        </div>
        <p className="hero-sanctuary__proof">
          Windows desktop app <span>•</span> No account <span>•</span> Data stays on your PC
        </p>
      </div>

      <div className="hero-sanctuary__stage" aria-label="Interactive Mochi desktop preview">
        <img
          className="hero-sanctuary__garden"
          src="/hero_sanctuary_panorama_v2.png"
          alt=""
          aria-hidden="true"
        />
        <span className="hero-sanctuary__mist hero-sanctuary__mist--left" aria-hidden="true" />
        <span className="hero-sanctuary__mist hero-sanctuary__mist--right" aria-hidden="true" />

        <div className="hero-sanctuary__window">
          <div className="hero-sanctuary__titlebar">
            <span className="hero-sanctuary__app-name">
              <i aria-hidden="true" /> Mochi
            </span>
            <span>Today</span>
            <span className="hero-sanctuary__window-controls" aria-hidden="true">
              — □ ×
            </span>
          </div>
          <div className="hero-sanctuary__app">
            <aside className="hero-sanctuary__sidebar">
              <div className="hero-sanctuary__brand">
                Mochi <small>Desktop Companion</small>
              </div>
              <div className="hero-sanctuary__side-focus">
                {detail.focus} focused today <small>Last session ended 11:35 AM</small>
              </div>
              <nav aria-label="Mochi preview sections">
                <span className="is-selected">
                  ◷ <b>Today</b>
                </span>
                <span>▦ Calendar</span>
                <span>◌ Time</span>
                <span>▥ Activity</span>
                <span>☼ Routines</span>
              </nav>
            </aside>
            <main className="hero-sanctuary__main">
              <header>
                <div>
                  <strong>Tuesday, 4 August</strong>
                  <small>{detail.message}</small>
                </div>
                <span
                  className={
                    mode === 'working' ? 'hero-sanctuary__live is-active' : 'hero-sanctuary__live'
                  }
                >
                  {detail.label}
                </span>
              </header>
              <div className="hero-sanctuary__stats">
                <div>
                  <strong>{detail.focus}</strong>
                  <span>tracked today</span>
                </div>
                <div>
                  <strong>{detail.completed}</strong>
                  <span>tasks done</span>
                </div>
                <div>
                  <strong>1</strong>
                  <span>next focus block</span>
                </div>
              </div>
              <div className="hero-sanctuary__tasks">
                <div className="hero-sanctuary__tasks-heading">
                  <strong>Today’s list</strong>
                  <span>{detail.completed} of 4 complete</span>
                </div>
                <div className="hero-sanctuary__task-row is-done">
                  <i>✓</i>
                  <span>Reply to design feedback</span>
                  <time>10:20 AM</time>
                </div>
                <div className="hero-sanctuary__task-row">
                  <i />
                  <span>
                    {mode === 'working' ? 'Finish the hero polish' : 'Finish the hero polish'}
                  </span>
                  <time>Next</time>
                </div>
                <button
                  className="hero-sanctuary__add-task"
                  type="button"
                  onClick={() => setMode('working')}
                >
                  + Add a task
                </button>
              </div>
              <div className="hero-sanctuary__activity">
                <div>
                  <span>THIS WEEK</span>
                  <strong>8h 20m total</strong>
                </div>
                <div className="hero-sanctuary__week-bars">
                  <i />
                  <i className="is-filled is-tall" />
                  <i className="is-filled" />
                  <i className="is-filled is-short" />
                  <i />
                  <i />
                  <i />
                </div>
                <div className="hero-sanctuary__week-days">
                  <span>M</span>
                  <span>T</span>
                  <span>W</span>
                  <span>T</span>
                  <span>F</span>
                  <span>S</span>
                  <span>S</span>
                </div>
              </div>
            </main>
          </div>
          <div className="hero-sanctuary__modebar" aria-label="Preview Mochi states">
            <div>
              {(Object.keys(modes) as HeroMode[]).map((item) => (
                <button
                  className={mode === item ? 'is-active' : undefined}
                  key={item}
                  onClick={() => setMode(item)}
                  type="button"
                >
                  {modes[item].label}
                </button>
              ))}
            </div>
            <span>{detail.action}</span>
          </div>
        </div>
      </div>

      <a className="hero-sanctuary__scroll" href="#your-day">
        Explore Mochi <span aria-hidden="true">↓</span>
      </a>
    </section>
  );
};
