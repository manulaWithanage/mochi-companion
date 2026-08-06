import { useEffect, useMemo, useState, type JSX } from 'react';
import { DEFAULT_WORK_HOURS, parseHhMm, type MochiSettings, type SkinSummary } from '@mochi/core';
import { Dashboard } from './Dashboard.js';
import { FeatureToggle } from './FeatureToggle.js';

/**
 * First run: a 3-step wizard — name, skin, work hours. Under 15 seconds,
 * and deliberately no API key, no account, no sign-in. Value comes before
 * configuration; everything else unlocks later from here.
 *
 * After setup this same window is the settings panel.
 */

/**
 * Three steps, not four.
 *
 * There was an "Account" step offering a 14-day Pro trial, cloud AI and
 * multi-device sync, with an email and a password field. **None of it exists.**
 * Mochi is desktop-only by decision — no Mochi account, no Mochi server, keys
 * stay on the machine — so the screen described a product that has never been
 * built, and `completeSetup` never carried the email or password anywhere. It
 * collected a password and dropped it.
 *
 * That is worse than a stale promise. People reuse passwords, and a field that
 * looks like a signup is treated like one. Removed rather than reworded.
 */
const STEPS = ['Companion', 'Hours', 'Personalize'] as const;

const shell: React.CSSProperties = {
  padding: '36px 42px',
  display: 'flex',
  flexDirection: 'column',
  gap: 24,
  minHeight: '100vh',
  maxWidth: 720,
  margin: '0 auto',
  boxSizing: 'border-box',
};

const label: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  letterSpacing: 0.4,
  textTransform: 'uppercase',
  opacity: 0.65,
  marginBottom: 8,
};

const input: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 10,
  border: '1px solid #3b3244',
  background: '#241f2b',
  color: '#f4eef6',
  fontSize: 15,
  boxSizing: 'border-box',
  outline: 'none',
};

/**
 * Every step opens the same way, and used to do it with a different emoji each
 * time. Emoji are drawn by the operating system, so the wizard's headings were
 * each set in a different typeface at a different weight, none of them the
 * one the heading itself is set in. Nothing decorates the headings now; the
 * only icons left are on the option rows, where they are vector and inherit
 * their colour from the row's state.
 */
const heading: React.CSSProperties = {
  margin: 0,
  fontSize: 25,
  fontWeight: 700,
  // Large text set at default tracking looks loose. Real headings are tightened.
  letterSpacing: -0.4,
  color: '#f4eef6',
};

const subheading: React.CSSProperties = {
  margin: '7px 0 0',
  fontSize: 13.5,
  color: '#a79ab2',
  lineHeight: 1.5,
};

const button = (primary: boolean): React.CSSProperties => ({
  padding: '11px 22px',
  borderRadius: 10,
  border: primary ? 'none' : '1px solid #3b3244',
  background: primary ? 'linear-gradient(135deg, #f2a6b3, #e58597)' : 'transparent',
  color: primary ? '#1c1625' : '#f4eef6',
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
  boxShadow: primary ? '0 4px 14px rgba(242,166,179,0.3)' : 'none',
  transition: 'transform 120ms ease, filter 120ms ease',
});

export function Setup(): JSX.Element {
  const [settings, setSettings] = useState<MochiSettings | null>(null);
  const [skins, setSkins] = useState<readonly SkinSummary[]>([]);
  const [step, setStep] = useState(0);

  const [name, setName] = useState('Mochi');
  // What to call the person, as opposed to `name`, which is what to call Mochi.
  // The wizard never asked for this, so completeSetup fell back to a hardcoded
  // name for every install.
  const [userName, setUserName] = useState('');
  const [skinName, setSkinName] = useState('default');
  const [start, setStart] = useState(DEFAULT_WORK_HOURS.start);
  const [end, setEnd] = useState(DEFAULT_WORK_HOURS.end);

  // Step 3: Interactive Workday Preferences.
  //
  // Both of these are applied by `finish`. A third, "Soft Audio Chimes", was
  // removed rather than restyled: nothing read its state, no global sound
  // setting exists to hold it, and the only chime in the app is
  // `mailPreferences.alertToneEnabled`, which main gates on `isMailReminder`.
  // So the row promised a switch over routine breaks that has never existed,
  // and turning it off silenced nothing.
  const [wellnessEnabled, setWellnessEnabled] = useState(true);
  const [activityTrackingEnabled, setActivityTrackingEnabled] = useState(true);

  useEffect(() => {
    void (async () => {
      const current = await window.mochi.settings.get();
      setSettings(current);
      setName(current.assistantName);
      setUserName(current.userName);
      setSkinName(current.skinName);
      setStart(current.workHours.start);
      setEnd(current.workHours.end);
      setSkins(await window.mochi.skin.listAvailable());
    })();
  }, []);

  const hoursValid = useMemo(
    () => parseHhMm(start) !== null && parseHhMm(end) !== null && start !== end,
    [start, end],
  );

  const finish = async (): Promise<void> => {
    // Activity tracking is not part of SetupPayload and has its own channel,
    // because it is opt-in by design and the setting has a dedicated setter.
    // Passing it in the payload silently dropped the user's choice: the field
    // was not in the contract, so the main process never read it.
    //
    // Applied first, so the settings completeSetup returns already include it
    // and the snapshot below is not stale.
    await window.mochi.settings.setActivityTracking(activityTrackingEnabled);

    // The wellness toggle used to be write-only: its state was read by nothing
    // but the styling of its own checkbox. `UserRoutinesVault` seeds every
    // preset with `enabled: true`, so declining here still left Hydration Break
    // and Stand & Stretch scheduled and firing — the wizard asked, and threw
    // the answer away.
    //
    // Only routines that are currently on are touched, because `toggle` flips.
    // Calling it unconditionally would switch a routine back on.
    if (!wellnessEnabled) {
      const routines = await window.mochi.userRoutines.list();
      for (const routine of routines) {
        if (routine.category === 'health' && routine.enabled) {
          await window.mochi.userRoutines.toggle(routine.id);
        }
      }
    }

    const updated = await window.mochi.settings.completeSetup({
      // Optional on the contract and omitted when blank: main leaves the
      // existing value alone rather than writing an empty one over it.
      ...(userName.trim().length > 0 ? { userName: userName.trim() } : {}),
      assistantName: name.trim() || 'Mochi',
      skinName,
      workHours: { start, end },
    });
    setSettings(updated);
    window.mochi.window.closeSetup();
  };

  if (settings === null) {
    return <div style={shell}>Loading…</div>;
  }

  if (settings.setupCompleted) return <Dashboard />;

  return (
    <div style={shell}>
      {/* Step Indicator Progress */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {STEPS.map((s, i) => (
          <div key={s} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div
              style={{
                height: 4,
                borderRadius: 2,
                background: i <= step ? 'linear-gradient(90deg, #f2a6b3, #cd7187)' : '#332c3d',
                transition: 'background 220ms ease',
              }}
            />
            <span
              style={{
                fontSize: 10.5,
                color: i === step ? '#f2a6b3' : '#73667d',
                fontWeight: i === step ? 650 : 500,
              }}
            >
              {i + 1}. {s}
            </span>
          </div>
        ))}
      </div>

      {/* STEP 1: Companion Name & Look */}
      {step === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 10 }}>
          <div>
            <h1 style={heading}>Let&rsquo;s introduce you two</h1>
            <p style={subheading}>
              Mochi is your calm desktop assistant. Tell it your name, give your companion one, and
              pick a look.
            </p>
          </div>

          <div>
            <span style={label}>Your Name</span>
            <input
              style={input}
              value={userName}
              maxLength={24}
              autoFocus
              placeholder="What should Mochi call you?"
              onChange={(e) => setUserName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setStep(1);
              }}
            />
            <p style={{ margin: '5px 0 0', fontSize: 11.5, color: '#73667d' }}>
              Optional. Used in your morning briefing and to sign drafted replies.
            </p>
          </div>

          <div>
            <span style={label}>Companion Name</span>
            <input
              style={input}
              value={name}
              maxLength={24}
              placeholder="e.g. Mochi, Luna, Kiko"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setStep(1);
              }}
            />
          </div>

          <div>
            <span style={label}>Choose Appearance Skin</span>
            <select style={input} value={skinName} onChange={(e) => setSkinName(e.target.value)}>
              {skins.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name} {s.author !== undefined ? ` — by ${s.author}` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* STEP 2: Workday Hours */}
      {step === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 10 }}>
          <div>
            <h1 style={heading}>When is your active workday?</h1>
            <p style={subheading}>
              Outside these hours, {name.trim() || 'Mochi'} enters Do Not Disturb mode so you can
              rest.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 16 }}>
            <div style={{ flex: 1 }}>
              <span style={label}>Work Starts</span>
              <input
                style={input}
                value={start}
                placeholder="09:00"
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div style={{ flex: 1 }}>
              <span style={label}>Work Ends</span>
              <input
                style={input}
                value={end}
                placeholder="17:00"
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>
          </div>

          {!hoursValid && (
            <p style={{ color: '#ffb3c1', fontSize: 12, margin: 0 }}>
              Please enter valid times in HH:MM format (e.g. 09:00 and 17:00).
            </p>
          )}
        </div>
      )}

      {/* STEP 3: Personalize Workday Toggles */}
      {step === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 10 }}>
          <div>
            <h1 style={heading}>Personalize your experience</h1>
            <p style={subheading}>
              Two things to decide now. Both can be changed later — routines from the Routines tab,
              tracking from Settings.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <FeatureToggle
              icon="droplet"
              title="Hydration and stretch reminders"
              // The old copy said "every 45 mins", which no preset does. These
              // are the times ROUTINE_PRESETS actually seeds for the health
              // category, so the sentence stays true unless the presets change.
              description="Water at 10:00, 12:30, 15:00 and 17:00; stand and stretch at 11:30, 14:30 and 16:30."
              recommended
              checked={wellnessEnabled}
              onToggle={() => setWellnessEnabled(!wellnessEnabled)}
            />

            <FeatureToggle
              icon="activity"
              title="Activity and screen time"
              // Not "window titles are never read" — that is the exact overclaim
              // `activity-sampler.ts` was corrected for. Titles are read when
              // site tracking is opted into, so the qualifier stays.
              description="Records which applications you use, on this device only. Window titles are not read unless you turn on site tracking later."
              checked={activityTrackingEnabled}
              onToggle={() => setActivityTrackingEnabled(!activityTrackingEnabled)}
            />
          </div>
        </div>
      )}

      {/* Navigation Buttons */}
      <div
        style={{
          marginTop: 'auto',
          display: 'flex',
          gap: 10,
          justifyContent: 'space-between',
          paddingTop: 16,
        }}
      >
        <button
          style={{ ...button(false), visibility: step === 0 ? 'hidden' : 'visible' }}
          onClick={() => setStep((s) => s - 1)}
        >
          Back
        </button>
        {step < STEPS.length - 1 ? (
          <button style={button(true)} onClick={() => setStep((s) => s + 1)}>
            Next
          </button>
        ) : (
          <button style={button(true)} disabled={!hoursValid} onClick={() => void finish()}>
            Complete setup
          </button>
        )}
      </div>
    </div>
  );
}
