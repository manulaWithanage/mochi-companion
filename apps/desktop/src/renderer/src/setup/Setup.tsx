import { useEffect, useMemo, useState, type JSX } from 'react';
import { DEFAULT_WORK_HOURS, parseHhMm, type MochiSettings, type SkinSummary } from '@mochi/core';
import { Dashboard } from './Dashboard.js';

/**
 * First run: a 3-step wizard — name, skin, work hours. Under 15 seconds,
 * and deliberately no API key, no account, no sign-in. Value comes before
 * configuration; everything else unlocks later from here.
 *
 * After setup this same window is the settings panel.
 */

const STEPS = ['Companion', 'Hours', 'Personalize', 'Account'] as const;

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

  // Step 3: Interactive Workday Preferences
  const [hydrationEnabled, setHydrationEnabled] = useState(true);
  const [chimeEnabled, setChimeEnabled] = useState(true);
  const [activityTrackingEnabled, setActivityTrackingEnabled] = useState(true);

  // Step 4: Account / Guest Choice
  const [accountMode, setAccountMode] = useState<'guest' | 'create'>('guest');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

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
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 750, color: '#f4eef6' }}>
              👋 Welcome! Let&rsquo;s introduce you two.
            </h1>
            <p style={{ margin: '6px 0 0', fontSize: 13.5, color: '#a79ab2', lineHeight: 1.45 }}>
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
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 750, color: '#f4eef6' }}>
              ⏰ When is your active workday?
            </h1>
            <p style={{ margin: '6px 0 0', fontSize: 13.5, color: '#a79ab2', lineHeight: 1.45 }}>
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
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 750, color: '#f4eef6' }}>
              ✨ Personalize Your Experience
            </h1>
            <p style={{ margin: '6px 0 0', fontSize: 13.5, color: '#a79ab2', lineHeight: 1.45 }}>
              Select recommended features to keep your workday healthy, focused, and balanced.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Toggle 1: Hydration & Breaks */}
            <div
              onClick={() => setHydrationEnabled(!hydrationEnabled)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '14px 16px',
                borderRadius: 12,
                background: hydrationEnabled ? 'rgba(242,166,179,0.08)' : '#241f2b',
                border: hydrationEnabled ? '1px solid rgba(242,166,179,0.3)' : '1px solid #3b3244',
                cursor: 'pointer',
                transition: 'all 160ms ease',
              }}
            >
              <input
                type="checkbox"
                checked={hydrationEnabled}
                onChange={() => {}}
                style={{ width: 18, height: 18, accentColor: '#f2a6b3' }}
              />
              <div>
                <strong style={{ fontSize: 14, color: '#f4eef6', display: 'block' }}>
                  💧 Hydration & Stretch Reminders (Recommended)
                </strong>
                <span style={{ fontSize: 12, color: '#a79ab2', marginTop: 2, display: 'block' }}>
                  Gentle nudges every 45 mins to drink water, stretch, and protect your energy.
                </span>
              </div>
            </div>

            {/* Toggle 2: Audio Chimes */}
            <div
              onClick={() => setChimeEnabled(!chimeEnabled)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '14px 16px',
                borderRadius: 12,
                background: chimeEnabled ? 'rgba(242,166,179,0.08)' : '#241f2b',
                border: chimeEnabled ? '1px solid rgba(242,166,179,0.3)' : '1px solid #3b3244',
                cursor: 'pointer',
                transition: 'all 160ms ease',
              }}
            >
              <input
                type="checkbox"
                checked={chimeEnabled}
                onChange={() => {}}
                style={{ width: 18, height: 18, accentColor: '#f2a6b3' }}
              />
              <div>
                <strong style={{ fontSize: 14, color: '#f4eef6', display: 'block' }}>
                  🔔 Soft Audio Chimes
                </strong>
                <span style={{ fontSize: 12, color: '#a79ab2', marginTop: 2, display: 'block' }}>
                  Plays a subtle, calming chime when routine breaks or top priority alerts trigger.
                </span>
              </div>
            </div>

            {/* Toggle 3: Activity Tracking */}
            <div
              onClick={() => setActivityTrackingEnabled(!activityTrackingEnabled)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '14px 16px',
                borderRadius: 12,
                background: activityTrackingEnabled ? 'rgba(242,166,179,0.08)' : '#241f2b',
                border: activityTrackingEnabled
                  ? '1px solid rgba(242,166,179,0.3)'
                  : '1px solid #3b3244',
                cursor: 'pointer',
                transition: 'all 160ms ease',
              }}
            >
              <input
                type="checkbox"
                checked={activityTrackingEnabled}
                onChange={() => {}}
                style={{ width: 18, height: 18, accentColor: '#f2a6b3' }}
              />
              <div>
                <strong style={{ fontSize: 14, color: '#f4eef6', display: 'block' }}>
                  📊 On-Device Activity & Screen Time Tracking
                </strong>
                <span style={{ fontSize: 12, color: '#a79ab2', marginTop: 2, display: 'block' }}>
                  Observes screen time 100% locally on your computer to show work breakdown graphs.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STEP 4: Account or Guest Choice */}
      {step === 3 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 10 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 750, color: '#f4eef6' }}>
              👤 Account & Pro Access
            </h1>
            <p style={{ margin: '6px 0 0', fontSize: 13.5, color: '#a79ab2', lineHeight: 1.45 }}>
              Choose how you want to start. You can create a free account for 14-day Pro cloud
              access or continue offline as a guest.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <div
              onClick={() => setAccountMode('guest')}
              style={{
                flex: 1,
                padding: 16,
                borderRadius: 12,
                background: accountMode === 'guest' ? 'rgba(242,166,179,0.08)' : '#241f2b',
                border: accountMode === 'guest' ? '2px solid #f2a6b3' : '1px solid #3b3244',
                cursor: 'pointer',
              }}
            >
              <h3 style={{ margin: 0, fontSize: 15, color: '#f4eef6' }}>👤 Continue as Guest</h3>
              <p style={{ margin: '6px 0 0', fontSize: 12, color: '#a79ab2', lineHeight: 1.4 }}>
                100% Offline Local Mode. No email or password needed. Use your own API keys for
                free.
              </p>
            </div>

            <div
              onClick={() => setAccountMode('create')}
              style={{
                flex: 1,
                padding: 16,
                borderRadius: 12,
                background: accountMode === 'create' ? 'rgba(242,166,179,0.08)' : '#241f2b',
                border: accountMode === 'create' ? '2px solid #f2a6b3' : '1px solid #3b3244',
                cursor: 'pointer',
              }}
            >
              <h3 style={{ margin: 0, fontSize: 15, color: '#f4eef6' }}>
                ✨ 14-Day Free Pro Trial
              </h3>
              <p style={{ margin: '6px 0 0', fontSize: 12, color: '#a79ab2', lineHeight: 1.4 }}>
                Create account to unlock zero-setup Cloud AI & multi-device sync (No credit card).
              </p>
            </div>
          </div>

          {accountMode === 'create' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
              <div>
                <span style={label}>Email</span>
                <input
                  style={input}
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div>
                <span style={label}>Password</span>
                <input
                  style={input}
                  type="password"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>
          )}
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
            🚀 Complete Setup & Start
          </button>
        )}
      </div>
    </div>
  );
}
