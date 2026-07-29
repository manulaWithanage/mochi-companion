import { useEffect, useMemo, useState, type JSX } from 'react';
import {
  DEFAULT_WORK_HOURS,
  formatDuration,
  parseHhMm,
  totalMs,
  type MochiSettings,
  type SkinSummary,
  type WorkSession,
} from '@mochi/core';
import { AiSection } from './AiSection.js';

/**
 * First run: a 3-step wizard — name, skin, work hours. Under 15 seconds,
 * and deliberately no API key, no account, no sign-in. Value comes before
 * configuration; everything else unlocks later from here.
 *
 * After setup this same window is the settings panel.
 */

const STEPS = ['Name', 'Look', 'Hours'] as const;

const shell: React.CSSProperties = {
  padding: '28px 32px',
  display: 'flex',
  flexDirection: 'column',
  gap: 20,
  minHeight: '100vh',
  boxSizing: 'border-box',
};

const label: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  letterSpacing: 0.4,
  textTransform: 'uppercase',
  opacity: 0.6,
  marginBottom: 8,
};

const input: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid #3b3244',
  background: '#241f2b',
  color: '#f4eef6',
  fontSize: 15,
  boxSizing: 'border-box',
};

const button = (primary: boolean): React.CSSProperties => ({
  padding: '10px 18px',
  borderRadius: 10,
  border: primary ? 'none' : '1px solid #3b3244',
  background: primary ? '#f2a6b3' : 'transparent',
  color: primary ? '#241f2b' : '#f4eef6',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
});

export function Setup(): JSX.Element {
  const [settings, setSettings] = useState<MochiSettings | null>(null);
  const [skins, setSkins] = useState<readonly SkinSummary[]>([]);
  const [sessions, setSessions] = useState<readonly WorkSession[]>([]);
  const [step, setStep] = useState(0);

  const [name, setName] = useState('Mochi');
  const [skinName, setSkinName] = useState('default');
  const [start, setStart] = useState(DEFAULT_WORK_HOURS.start);
  const [end, setEnd] = useState(DEFAULT_WORK_HOURS.end);

  useEffect(() => {
    void (async () => {
      const current = await window.mochi.settings.get();
      setSettings(current);
      setName(current.assistantName);
      setSkinName(current.skinName);
      setStart(current.workHours.start);
      setEnd(current.workHours.end);
      setSkins(await window.mochi.skin.listAvailable());
      if (current.setupCompleted) setSessions(await window.mochi.timer.listSessions());
    })();
  }, []);

  const hoursValid = useMemo(
    () => parseHhMm(start) !== null && parseHhMm(end) !== null && start !== end,
    [start, end],
  );

  const finish = async (): Promise<void> => {
    const updated = await window.mochi.settings.completeSetup({
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

  // ---- settings view (post-setup) ---------------------------------------
  if (settings.setupCompleted) {
    const tracked = totalMs(sessions as WorkSession[], Date.now());
    return (
      <div style={shell}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>{settings.assistantName}</h1>
          <p style={{ margin: '6px 0 0', opacity: 0.6, fontSize: 13 }}>
            {sessions.length} session{sessions.length === 1 ? '' : 's'} · {formatDuration(tracked)}{' '}
            tracked
          </p>
        </div>

        <div>
          <span style={label}>Name</span>
          <input
            style={input}
            value={name}
            maxLength={24}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div>
          <span style={label}>Skin</span>
          <select style={input} value={skinName} onChange={(e) => setSkinName(e.target.value)}>
            {skins.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
                {s.license !== undefined ? ` — ${s.license}` : ''}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <span style={label}>Work starts</span>
            <input style={input} value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <span style={label}>Work ends</span>
            <input style={input} value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        {!hoursValid && (
          <p style={{ color: '#ffb3c1', fontSize: 12, margin: 0 }}>
            Use HH:MM, and make the two different.
          </p>
        )}

        <AiSection />

        <div
          style={{
            paddingTop: 12,
            borderTop: '1px solid #2c2634',
            fontSize: 12,
            opacity: 0.5,
          }}
        >
          Still locked — needs a Google connection:
          <br />
          Morning Briefing · Calendar alerts · Email triage
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button style={button(false)} onClick={() => window.mochi.window.closeSetup()}>
            Close
          </button>
          <button style={button(true)} disabled={!hoursValid} onClick={() => void finish()}>
            Save
          </button>
        </div>
      </div>
    );
  }

  // ---- first-run wizard --------------------------------------------------
  return (
    <div style={shell}>
      <div style={{ display: 'flex', gap: 8 }}>
        {STEPS.map((s, i) => (
          <div
            key={s}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              background: i <= step ? '#f2a6b3' : '#332c3d',
            }}
          />
        ))}
      </div>

      {step === 0 && (
        <>
          <h1 style={{ margin: 0, fontSize: 24 }}>Hi! What should you call me?</h1>
          <input
            style={input}
            value={name}
            maxLength={24}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setStep(1);
            }}
          />
        </>
      )}

      {step === 1 && (
        <>
          <h1 style={{ margin: 0, fontSize: 24 }}>Pick a look</h1>
          <select style={input} value={skinName} onChange={(e) => setSkinName(e.target.value)}>
            {skins.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
                {s.author !== undefined ? ` — by ${s.author}` : ''}
              </option>
            ))}
          </select>
          <p style={{ opacity: 0.55, fontSize: 13, margin: 0 }}>
            More skins can be dropped into your Mochi folder later.
          </p>
        </>
      )}

      {step === 2 && (
        <>
          <h1 style={{ margin: 0, fontSize: 24 }}>When do you usually work?</h1>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <span style={label}>From</span>
              <input style={input} value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <span style={label}>Until</span>
              <input style={input} value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <p style={{ opacity: 0.55, fontSize: 13, margin: 0 }}>
            Outside these hours {name.trim() || 'Mochi'} settles down and rests.
          </p>
          {!hoursValid && (
            <p style={{ color: '#ffb3c1', fontSize: 12, margin: 0 }}>
              Use HH:MM, and make the two different.
            </p>
          )}
        </>
      )}

      <div style={{ marginTop: 'auto', display: 'flex', gap: 10, justifyContent: 'space-between' }}>
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
            Let&apos;s go
          </button>
        )}
      </div>
    </div>
  );
}
