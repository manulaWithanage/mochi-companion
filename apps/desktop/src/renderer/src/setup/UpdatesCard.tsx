import { useEffect, useState, type JSX } from 'react';
import {
  canCheckForUpdates,
  describeUpdateStatus,
  updateAwaitsRestart,
  type UpdateStatus,
} from '@mochi/core';
import { button, C, card } from './ui.js';

/**
 * The update process, where someone can actually see it.
 *
 * Everything here already happened automatically and invisibly: a check at
 * launch and every six hours, a background download, an install on quit. The
 * gap was that none of it was observable, so an install sitting on an old
 * version was indistinguishable from one that had failed — and both looked
 * exactly like one that was up to date.
 *
 * Two buttons, because there were two ways to be stuck. **Check now** exists
 * because the six-hour interval is fine as a background rhythm and useless to
 * someone who has just been told there is a new version. **Restart and install**
 * exists because updates install on quit and closing this window does not quit
 * Mochi — the overlay lives in the tray — so the last step used to require
 * knowing that.
 */
export function UpdatesCard(): JSX.Element {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  // Only so "checked 4 minutes ago" does not freeze at "just now" while the
  // panel sits open.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    void window.mochi.app.version().then(setVersion).catch(noop);
    void window.mochi.updater.status().then(setStatus).catch(noop);
    const stop = window.mochi.updater.onChange(setStatus);
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      stop();
      clearInterval(tick);
    };
  }, []);

  const ready = status !== null && updateAwaitsRestart(status);
  const failed = status?.state === 'failed';

  return (
    <div style={{ ...card, marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 4 }}>Updates</div>
      <div style={{ fontSize: 12, color: C.dim, marginBottom: 12 }}>
        Mochi updates itself in the background and applies it the next time you quit.
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13.5, color: C.text }}>
            {/* Null until asked. A guess here would be the one number nobody
                can afford to have wrong. */}
            {version === null ? 'Mochi' : `Mochi ${version}`}
          </div>
          <div
            style={{
              fontSize: 12,
              color: failed ? C.warn : C.dim,
              marginTop: 3,
              lineHeight: 1.45,
            }}
          >
            {status === null ? 'Reading update status…' : describeUpdateStatus(status, now)}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          {ready ? (
            <button
              style={button('primary')}
              onClick={() => void window.mochi.updater.installNow()}
            >
              Restart and install
            </button>
          ) : (
            <button
              style={button()}
              disabled={status === null || !canCheckForUpdates(status)}
              onClick={() => void window.mochi.updater.check().then(setStatus).catch(noop)}
            >
              {failed ? 'Try again' : 'Check now'}
            </button>
          )}
        </div>
      </div>

      {status?.state === 'downloading' && (
        <div
          // Not a text percentage alone: a 104 MB download on a slow link is
          // long enough that a number which has not moved for ten seconds reads
          // as frozen, and a bar that is visibly filling does not.
          style={{
            height: 4,
            borderRadius: 2,
            background: C.border,
            marginTop: 12,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${Math.max(2, Math.min(100, status.percent))}%`,
              background: `linear-gradient(90deg, ${C.accent}, #cd7187)`,
              transition: 'width 300ms ease',
            }}
          />
        </div>
      )}
    </div>
  );
}

/** Status is cosmetic; a failure to read it must not take the settings panel down. */
function noop(): void {}
