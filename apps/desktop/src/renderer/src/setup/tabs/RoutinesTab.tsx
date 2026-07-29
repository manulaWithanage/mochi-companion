import { useEffect, useState, type JSX } from 'react';
import { parseHhMm, type MochiSettings } from '@mochi/core';
import { button, C, card, h2, input, label, sub } from '../ui.js';

/**
 * Lifestyle: when Mochi is around, and when it is allowed to speak.
 *
 * This is the user-facing surface of the interruption governor. Those rules
 * were previously invisible — configurable only in code — which meant the one
 * thing most likely to make someone uninstall Mochi had no dial.
 */

const Toggle = ({
  on,
  onChange,
  title,
  desc,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  title: string;
  desc: string;
}): JSX.Element => (
  <div
    style={{
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 14,
      padding: '10px 0',
      borderTop: `1px solid ${C.border}`,
    }}
  >
    <div>
      <div style={{ fontSize: 13.5 }}>{title}</div>
      <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>{desc}</div>
    </div>
    <button
      onClick={() => onChange(!on)}
      aria-pressed={on}
      style={{
        flexShrink: 0,
        width: 42,
        height: 24,
        borderRadius: 999,
        border: 'none',
        cursor: 'pointer',
        background: on ? C.accent : '#3b3244',
        position: 'relative',
        transition: 'background 160ms ease',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 3,
          left: on ? 21 : 3,
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: on ? '#241f2b' : C.text,
          transition: 'left 160ms ease',
        }}
      />
    </button>
  </div>
);

export function RoutinesTab(): JSX.Element {
  const [settings, setSettings] = useState<MochiSettings | null>(null);
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('17:00');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void window.mochi.settings.get().then((s) => {
      setSettings(s);
      setStart(s.workHours.start);
      setEnd(s.workHours.end);
    });
    return window.mochi.settings.onChange(setSettings);
  }, []);

  if (settings === null) return <div style={card}>Loading…</div>;

  const hoursValid = parseHhMm(start) !== null && parseHhMm(end) !== null && start !== end;

  const saveHours = async (): Promise<void> => {
    if (!hoursValid) return;
    await window.mochi.settings.completeSetup({
      assistantName: settings.assistantName,
      skinName: settings.skinName,
      workHours: { start, end },
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  return (
    <div>
      <h2 style={h2}>Routines</h2>
      <p style={sub}>When Mochi is around, and when it is allowed to speak up.</p>

      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: C.dim, marginBottom: 12 }}>Working hours</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <span style={label}>From</span>
            <input style={input} value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <span style={label}>Until</span>
            <input style={input} value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <button style={button('primary')} disabled={!hoursValid} onClick={() => void saveHours()}>
            {saved ? 'Saved' : 'Save'}
          </button>
        </div>
        {!hoursValid && (
          <p style={{ color: C.warn, fontSize: 12, margin: '8px 0 0' }}>
            Use HH:MM, and make the two different.
          </p>
        )}
        <p style={{ fontSize: 12, color: C.faint, margin: '10px 0 0' }}>
          Outside these hours {settings.assistantName} rests, and the day-start and day-end nudges
          are scheduled from them.
        </p>
      </div>

      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: C.dim, marginBottom: 4 }}>Interruptions</div>

        <Toggle
          on={settings.doNotDisturb}
          onChange={(v) => void window.mochi.settings.setDoNotDisturb(v)}
          title="Do not disturb"
          desc="Mochi stays on screen and keeps tracking time, but never speaks unprompted."
        />
        <Toggle
          on={settings.paused}
          onChange={(v) => void window.mochi.settings.setPaused(v)}
          title={`Hide ${settings.assistantName}`}
          desc="Removes the mascot from the screen entirely. The tray icon stays."
        />
      </div>

      <div style={card}>
        <div style={{ fontSize: 12, color: C.dim, marginBottom: 10 }}>
          What Mochi says on its own
        </div>
        {[
          ['Start of day', 'A greeting when your working hours begin.'],
          ['Break nudges', 'Roughly every 90 minutes through the working day.'],
          ['End of day', 'A prompt to stop when your hours are over.'],
          ['Long session', 'After about 100 minutes of unbroken tracking.'],
        ].map(([title, desc]) => (
          <div
            key={title}
            style={{ padding: '8px 0', borderTop: `1px solid ${C.border}`, fontSize: 13 }}
          >
            {title}
            <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>{desc}</div>
          </div>
        ))}
        <p style={{ fontSize: 12, color: C.faint, margin: '12px 0 0', lineHeight: 1.5 }}>
          All of these pass an interruption budget first — at most 3 an hour, never less than 90
          seconds apart, silent during quiet hours and while anything is fullscreen. Dismissing one
          stops that subject coming back.
        </p>
      </div>
    </div>
  );
}
