import React, { useEffect, useState } from 'react';
import { MochiIcon } from './MochiIcon';
import { Footer } from './Footer';
import { HeroDiorama } from './HeroDiorama';
import { MochiStoryGuide } from './MochiStoryGuide';

const Check = () => <span className="story-check">✓</span>;

const storyMessages = {
  purpose: {
    message: 'Your day has a calm place to begin, without another system to manage.',
    state: 'idle',
  },
  'your-day': {
    message: 'Two priorities and one meeting. Your morning has room to breathe.',
    state: 'idle',
  },
  email: {
    message: 'I brought the replies waiting on you forward. The rest can stay quiet.',
    state: 'idle',
  },
  focus: { message: 'Pick one thing. I will keep the time.', state: 'working' },
  routine: { message: 'A small pause is part of the plan.', state: 'coffee' },
  privacy: { message: 'Your day stays on your computer, close to you.', state: 'resting' },
  connections: { message: 'Start simple. Connect more only when it helps.', state: 'idle' },
  download: { message: 'Ready when you are.', state: 'idle' },
} as const;

export const LandingPage: React.FC = () => {
  const [activeStory, setActiveStory] = useState<keyof typeof storyMessages | null>(null);

  useEffect(() => {
    const sections = Array.from(document.querySelectorAll<HTMLElement>('[data-mochi-story]'));
    const observer = new IntersectionObserver(
      (entries) => {
        const active = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const id = active?.target.getAttribute('data-mochi-story');
        if (typeof id === 'string' && id in storyMessages) {
          setActiveStory(id as keyof typeof storyMessages);
        }
      },
      { threshold: [0.45, 0.6] },
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  const guide = activeStory === null ? null : storyMessages[activeStory];

  return (
    <div className="landing-page">
      <nav className="landing-nav">
        <a className="landing-brand" href="#top" aria-label="Mochi home">
          <MochiIcon size={34} glow={false} />
          <span>
            Mochi <small>Desktop Companion</small>
          </span>
        </a>
        <div className="landing-nav__links">
          <a href="#your-day">Your day</a>
          <a href="#focus">Focus</a>
          <a href="#privacy">Privacy</a>
        </div>
        <a className="landing-nav__download" href="/Mochi-Setup.exe" download>
          Download for Windows
        </a>
      </nav>

      <main id="top">
        <HeroDiorama />

        {/* Section 1: Purpose Quote */}
        <section
          className="story-section story-section--purpose"
          id="why-mochi"
          data-mochi-story="purpose"
        >
          <div className="story-intro story-intro--center">
            <p className="story-eyebrow">WHY WE BUILT MOCHI</p>
            <h2 className="hero-purpose-quote">
              “We didn’t build Mochi to add another system to your workday. We built it so you can <em>focus on what matters</em>, close your computer on time, and <em>feel good about your day</em>.”
            </h2>
          </div>
        </section>

        {/* Section 2: How Mochi Helps (The 3 Pillars) */}
        <section
          className="story-section story-section--pillars"
          id="how-mochi-helps"
          data-mochi-story="pillars"
        >
          <div className="story-intro story-intro--center">
            <p className="story-eyebrow">HOW MOCHI HELPS YOU</p>
            <h2>Three simple ways Mochi brings peace to your workday.</h2>
            <p>
              Designed from the ground up to protect your attention, keep your day organized, and stay 100% private on your computer.
            </p>
          </div>

          <div className="promise-grid">
            <article className="promise-card promise-card--plan">
              <div className="promise-preview promise-preview--plan" aria-hidden="true">
                <div className="promise-preview__top">
                  <span>Today</span>
                  <i>Ready</i>
                </div>
                <strong>A lighter plan for today.</strong>
                <div className="promise-preview__tasks">
                  <span>
                    <b>✓</b> Finish the landing page polish
                  </span>
                  <span>
                    <b>✓</b> Reply to design feedback
                  </span>
                </div>
                <div className="promise-preview__bars">
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
              </div>
              <div className="promise-card__copy">
                <small>01 · START CLEAR</small>
                <h3>Know what matters first.</h3>
                <p>
                  See your top priorities, planned focus time, and next meeting before the morning gets noisy.
                </p>
              </div>
            </article>

            <article className="promise-card promise-card--attention">
              <div className="promise-preview promise-preview--attention" aria-hidden="true">
                <div className="promise-preview__top">
                  <span>Needs a reply</span>
                  <i>3</i>
                </div>
                <div className="promise-preview__mail is-urgent">
                  <b>J</b>
                  <span>
                    <strong>Approval needed for launch</strong>
                    <em>Please confirm today</em>
                  </span>
                </div>
                <div className="promise-preview__mail">
                  <b>M</b>
                  <span>
                    <strong>Design review feedback</strong>
                    <em>A few final notes</em>
                  </span>
                </div>
                <div className="promise-preview__mail">
                  <b>A</b>
                  <span>
                    <strong>Meeting notes</strong>
                    <em>For your reference</em>
                  </span>
                </div>
              </div>
              <div className="promise-card__copy">
                <small>02 · KEEP FOCUS</small>
                <h3>Only what needs your attention.</h3>
                <p>
                  Important emails, waiting replies, and focus blocks float up when needed. Newsletters and noise stay out of the way.
                </p>
              </div>
            </article>

            <article className="promise-card promise-card--private">
              <div className="promise-preview promise-preview--private" aria-hidden="true">
                <div className="promise-preview__top">
                  <span>On your computer</span>
                  <i>Local</i>
                </div>
                <div className="promise-preview__lock">⌂</div>
                <strong>Your day stays close.</strong>
                <div className="promise-preview__chips">
                  <span>Tasks</span>
                  <span>Focus</span>
                  <span>History</span>
                </div>
              </div>
              <div className="promise-card__copy">
                <small>03 · STAY YOURS</small>
                <h3>Private by default, on your PC.</h3>
                <p>
                  Your tasks, focus history, and personal routines stay encrypted in a local database on your computer. No accounts, no cloud tracking.
                </p>
              </div>
            </article>
          </div>
        </section>

        <section
          className="story-section story-section--overview"
          id="your-day"
          data-mochi-story="your-day"
        >
          <div className="story-intro">
            <p className="story-eyebrow">YOUR DAILY OVERVIEW</p>
            <h2>Know what matters before the day gets loud.</h2>
            <p>
              Open Mochi to see today’s priorities, planned focus time, upcoming events, and
              messages that need a reply. Everything is together, without an inbox or a browser tab
              competing for your attention.
            </p>
          </div>
          <div className="morning-window" aria-label="Example Mochi daily overview">
            <div className="morning-window__bar">
              <span>
                <i /> Mochi
              </span>
              <strong>Tuesday, 4 August</strong>
              <span>☼ Good morning</span>
            </div>
            <div className="morning-window__body">
              <div className="morning-window__greeting">
                <div>
                  <p>GOOD MORNING, MANU</p>
                  <h3>A lighter plan for today.</h3>
                </div>
                <span>
                  2 priorities
                  <br />
                  <b>1 meeting</b>
                </span>
              </div>
              <div className="morning-grid">
                <div className="morning-card morning-card--priorities">
                  <p>TOP PRIORITIES</p>
                  <div>
                    <Check /> Finish the landing page polish <time>10:30</time>
                  </div>
                  <div>
                    <Check /> Reply to design feedback <time>2:00</time>
                  </div>
                  <button>+ Add something small</button>
                </div>
                <div className="morning-card morning-card--schedule">
                  <p>UP NEXT</p>
                  <strong>11:00 AM</strong>
                  <span>
                    Product planning
                    <br />
                    with the Mochi team
                  </span>
                  <hr />
                  <small>Focus block starts at 9:30 AM</small>
                </div>
                <div className="morning-card morning-card--note">
                  <p>MOCHI’S NOTE</p>
                  <strong>Start with the design polish.</strong>
                  <span>You have a clear 90 minutes before your meeting.</span>
                  <b>Start focus</b>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="story-section story-section--email" id="email" data-mochi-story="email">
          <div className="email-scene" aria-label="Example important email list">
            <div className="email-scene__top">
              <span>✦ Needs a reply</span>
              <small>3 waiting</small>
            </div>
            <div className="email-row is-priority">
              <i>J</i>
              <div>
                <strong>Urgent: approval needed for launch</strong>
                <span>Joanna Kim · Please confirm today</span>
              </div>
              <time>9:18</time>
            </div>
            <div className="email-row">
              <i>M</i>
              <div>
                <strong>Design review feedback</strong>
                <span>Manula Withanage · A few final notes</span>
              </div>
              <time>8:42</time>
            </div>
            <div className="email-row">
              <i>A</i>
              <div>
                <strong>Meeting notes from Monday</strong>
                <span>Alex Lee · For your reference</span>
              </div>
              <time>Mon</time>
            </div>
            <div className="email-scene__calm">Quietly sorted. No need to chase the inbox.</div>
          </div>
          <div className="story-intro story-intro--left">
            <p className="story-eyebrow">EMAIL, WITH LESS NOISE</p>
            <h2>See the messages that need you.</h2>
            <p>
              When you choose to connect Gmail, Mochi brings forward important messages, replies
              waiting on you, and email that belongs to today’s work. Newsletters and noise can stay
              out of the way.
            </p>
            <p className="story-note">Gmail is optional and only connects when you choose.</p>
          </div>
        </section>

        <section className="story-section story-section--focus" id="focus" data-mochi-story="focus">
          <div className="story-intro story-intro--center">
            <p className="story-eyebrow">FOCUS COMPANION</p>
            <h2>Choose one thing. Start when you are ready.</h2>
            <p>
              Mochi stays nearby while you work. One click begins a session, records the time
              honestly, and makes space for a real pause when you finish.
            </p>
          </div>
          <div className="focus-steps">
            <article>
              <span className="focus-steps__number">01</span>
              <div className="focus-orb focus-orb--ready">◕</div>
              <p>READY</p>
              <h3>Your next task is ready.</h3>
              <small>Pick one small thing to begin.</small>
            </article>
            <article className="focus-steps__active">
              <span className="focus-steps__number">02</span>
              <div className="focus-orb focus-orb--focus">◕</div>
              <p>FOCUS</p>
              <h3>A calm presence while you work.</h3>
              <small>Focus time is quietly in progress.</small>
            </article>
            <article>
              <span className="focus-steps__number">03</span>
              <div className="focus-orb focus-orb--rest">◕</div>
              <p>REST</p>
              <h3>Pause before the next thing.</h3>
              <small>Take a breath. Your rhythm is safe.</small>
            </article>
          </div>
        </section>

        <section
          className="story-section story-section--routines"
          id="routine"
          data-mochi-story="routine"
        >
          <div className="story-intro story-intro--left">
            <p className="story-eyebrow">GENTLE ROUTINES</p>
            <h2>Support for the hours around your work.</h2>
            <p>
              Create small reminders that fit your actual day. Mochi nudges when it is useful, then
              gets out of the way.
            </p>
          </div>
          <div className="routine-garden">
            <div className="routine-garden__sun" />
            <div className="routine-pill">
              💧 <span>Water break</span>
              <b>10:45 AM</b>
            </div>
            <div className="routine-pill">
              ↗ <span>Look away from the screen</span>
              <b>2 minutes</b>
            </div>
            <div className="routine-pill">
              ⌁ <span>Stretch your shoulders</span>
              <b>3:30 PM</b>
            </div>
            <div className="routine-garden__hill routine-garden__hill--one" />
            <div className="routine-garden__hill routine-garden__hill--two" />
          </div>
        </section>

        <section
          className="story-section story-section--privacy"
          id="privacy"
          data-mochi-story="privacy"
        >
          <div className="privacy-panel">
            <div>
              <p className="story-eyebrow">PRIVATE BY DEFAULT</p>
              <h2>Your computer. Your rhythm.</h2>
              <p>
                Mochi keeps your core day close to home. Tasks, focus time, routines, and history
                are stored locally on your Windows computer, with no account required.
              </p>
            </div>
            <div className="privacy-panel__facts">
              <p>
                <Check />
                <span>
                  <b>Local-first</b> Core data lives in a local SQLite database on your PC.
                </span>
              </p>
              <p>
                <Check />
                <span>
                  <b>Activity is your choice</b> It is off by default. If enabled, Mochi uses
                  process names and idle time, never window titles.
                </span>
              </p>
              <p>
                <Check />
                <span>
                  <b>Built to forget</b> Activity history clears after 90 days, and you can remove
                  it anytime.
                </span>
              </p>
            </div>
          </div>
        </section>

        <section
          className="story-section story-section--connections"
          data-mochi-story="connections"
        >
          <div className="story-intro story-intro--center">
            <p className="story-eyebrow">OPTIONAL INTELLIGENCE</p>
            <h2>Start simple. Connect only what helps.</h2>
            <p>
              Mochi works beautifully on its own. Add local AI, a provider you trust, Gmail, or
              calendar only when it genuinely makes your day easier.
            </p>
          </div>
          <div className="connection-grid">
            <article>
              <small className="connection-card__step">01 · CORE</small>
              <span>◌</span>
              <h3>Mochi only</h3>
              <p>Tasks, focus, routines, and local history. No account.</p>
            </article>
            <article>
              <small className="connection-card__step">02 · ON YOUR COMPUTER</small>
              <span>⌘</span>
              <h3>Local AI</h3>
              <p>Use Ollama or LM Studio on your own computer.</p>
            </article>
            <article>
              <small className="connection-card__step">03 · WHEN YOU CHOOSE</small>
              <span>✦</span>
              <h3>Connected tools</h3>
              <p>Choose Gmail, calendar, or your preferred AI provider.</p>
            </article>
          </div>
        </section>

        <section className="landing-cta" id="download" data-mochi-story="download">
          <p className="story-eyebrow">READY WHEN YOU ARE</p>
          <h2>
            Start with one task.
            <br />
            Make room for the rest.
          </h2>
          <p>
            Download Mochi for Windows and bring your plans, important messages, focus, and
            reminders into one quieter place.
          </p>
          <a href="/Mochi-Setup.exe" download>
            Download Mochi for Windows
          </a>
          <small>No account required</small>
        </section>
      </main>
      {guide !== null && activeStory !== null && (
        <MochiStoryGuide key={activeStory} message={guide.message} state={guide.state} />
      )}
      <Footer />
    </div>
  );
};
