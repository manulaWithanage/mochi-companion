import { useCallback, useEffect, useRef, useState, type JSX } from 'react';
import {
  formatDuration,
  isAlertPhase,
  magicianPose,
  MASCOT_BOX,
  smokeMode,
  type BubbleMessage,
  type LoadedSkin,
  type MagicianPhase,
  type MascotState,
  type TimerSnapshot,
} from '@mochi/core';
import { useSpriteAnimation } from './useSpriteAnimation.js';
import { SpeechBubble } from './SpeechBubble.js';
import { SmokeEffect } from './SmokeEffect.js';
import { OverlayCategoryPills } from './OverlayCategoryPills.js';
import { playGentleAlertTone } from './alert-tone.js';

/** Pointer travel beyond this counts as a drag, not a click. */
const DRAG_THRESHOLD_PX = 4;
/** Hover hit-testing is throttled; it runs on every forwarded mousemove. */
const HOVER_SAMPLE_MS = 40;

export function Overlay(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [skin, setSkin] = useState<LoadedSkin | null>(null);
  const [mascotState, setMascotState] = useState<MascotState>('idle');
  const [visible, setVisible] = useState(true);
  const [timer, setTimer] = useState<TimerSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bubble, setBubble] = useState<string | null>(null);
  /**
   * Driven entirely by main. The renderer has no business deciding when a
   * performance happens — it used to infer it by looking for "routine" in the
   * bubble subject, which fired the whole entrance for ordinary nudges.
   */
  const [phase, setPhase] = useState<MagicianPhase>('none');
  const bubbleSubject = useRef<string | null>(null);
  const bubbleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const alertToneTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const interactiveRef = useRef(false);
  const lastHoverCheck = useRef(0);
  const drag = useRef<{ active: boolean; moved: boolean; x: number; y: number }>({
    active: false,
    moved: false,
    x: 0,
    y: 0,
  });

  useSpriteAnimation({ canvas, skin, state: mascotState, visible });

  // ---- initial load ------------------------------------------------------
  useEffect(() => {
    void (async () => {
      try {
        const settings = await window.mochi.settings.get();
        setSkin(await window.mochi.skin.load(settings.skinName));
        setMascotState(await window.mochi.mascot.current());
        setTimer(await window.mochi.timer.current());
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'failed to load skin');
      }
    })();
  }, []);

  // ---- speech bubble & magician alert entrance ----------------------------
  const dismissBubble = useCallback(() => {
    if (bubbleTimer.current !== undefined) clearTimeout(bubbleTimer.current);
    bubbleTimer.current = undefined;
    setBubble(null);

    if (bubbleSubject.current !== null) {
      window.mochi.bubble.dismiss(bubbleSubject.current);
      bubbleSubject.current = null;
    }
  }, []);

  useEffect(() => {
    const off = window.mochi.bubble.onShow((message: BubbleMessage) => {
      if (bubbleTimer.current !== undefined) clearTimeout(bubbleTimer.current);
      if (alertToneTimer.current !== undefined) clearTimeout(alertToneTimer.current);
      bubbleSubject.current = message.subject;
      setBubble(message.text);

      if (message.alertTone === 'gentle') {
        alertToneTimer.current = setTimeout(
          () => {
            alertToneTimer.current = undefined;
            void playGentleAlertTone().catch(() => undefined);
          },
          Math.max(0, message.alertToneDelayMs ?? 0),
        );
      }

      bubbleTimer.current = setTimeout(() => {
        bubbleSubject.current = null;
        setBubble(null);
      }, message.ttlMs);
    });
    return () => {
      off();
      if (bubbleTimer.current !== undefined) clearTimeout(bubbleTimer.current);
      if (alertToneTimer.current !== undefined) clearTimeout(alertToneTimer.current);
    };
  }, []);

  // ---- magician phase ----------------------------------------------------
  useEffect(() => window.mochi.overlay.onMagicianPhase(setPhase), []);

  // A ref as well as state: the subscription callbacks below are registered
  // once and would otherwise close over the phase from first render.
  const performingRef = useRef(false);
  useEffect(() => {
    performingRef.current = phase !== 'none';
  }, [phase]);

  /**
   * The alert face follows the phase, not the bubble.
   *
   * Asking main for the derived state on the way out is what previously left
   * the face out of step: the reply arrived a tick after the phase changed, so
   * the mascot flickered back to alert for a frame.
   */
  useEffect(() => {
    if (isAlertPhase(phase)) {
      setMascotState('alert');
    } else if (phase === 'none') {
      void window.mochi.mascot.current().then(setMascotState);
    }
  }, [phase]);

  // ---- subscriptions -----------------------------------------------------
  useEffect(() => {
    // A performance owns the face while it runs, so derived state updates are
    // held back until it finishes. Previously this was gated on the bubble
    // subject containing "routine", which is the same guess that made ordinary
    // nudges puff smoke.
    const offState = window.mochi.mascot.onStateChange((state) => {
      if (!performingRef.current) setMascotState(state);
    });
    const offTimer = window.mochi.timer.onChange((s) => {
      setTimer(s);
      void window.mochi.mascot.current().then((st) => {
        if (!performingRef.current) setMascotState(st);
      });
    });
    const offVisible = window.mochi.overlay.onVisibilityChange(setVisible);
    const offSettings = window.mochi.settings.onChange((next) => {
      void window.mochi.skin
        .load(next.skinName)
        .then(setSkin)
        .catch(() => undefined);
    });
    return () => {
      offState();
      offTimer();
      offVisible();
      offSettings();
    };
  }, []);

  useEffect(() => {
    const onChange = (): void => {
      if (document.visibilityState === 'hidden') setVisible(false);
      else setVisible(true);
    };
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);

  useEffect(() => {
    if (timer === null || !timer.running || !visible) return;
    const id = setInterval(() => {
      void window.mochi.timer.current().then(setTimer);
    }, 1000);
    return () => clearInterval(id);
  }, [timer, visible]);

  const setInteractive = useCallback((next: boolean) => {
    if (interactiveRef.current === next) return;
    interactiveRef.current = next;
    window.mochi.overlay.setInteractive(next);
  }, []);

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (drag.current.active) {
        const dx = event.screenX - drag.current.x;
        const dy = event.screenY - drag.current.y;
        if (Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX) {
          drag.current.moved = true;
        }
        if (drag.current.moved) {
          window.mochi.overlay.dragBy(dx, dy);
          drag.current.x = event.screenX;
          drag.current.y = event.screenY;
        }
        return;
      }

      const now = performance.now();
      if (now - lastHoverCheck.current < HOVER_SAMPLE_MS) return;
      lastHoverCheck.current = now;

      const el = canvasRef.current;
      if (el === null) return;
      const ctx = el.getContext('2d', { willReadFrequently: true });
      if (ctx === null) return;

      const rect = el.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const x = Math.floor((event.clientX - rect.left) * dpr);
      const y = Math.floor((event.clientY - rect.top) * dpr);
      if (x < 0 || y < 0 || x >= el.width || y >= el.height) {
        setInteractive(false);
        return;
      }
      const alpha = ctx.getImageData(x, y, 1, 1).data[3] ?? 0;
      setInteractive(alpha > 16);
    },
    [setInteractive],
  );

  const [showPills, setShowPills] = useState(false);
  const pillsTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const revealPills = useCallback(() => {
    setShowPills(true);
    if (pillsTimer.current !== undefined) clearTimeout(pillsTimer.current);
    pillsTimer.current = setTimeout(() => {
      setShowPills(false);
    }, 4500);
  }, []);

  const [clickScale, setClickScale] = useState(1);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return;
    drag.current = { active: true, moved: false, x: event.screenX, y: event.screenY };
    event.currentTarget.setPointerCapture(event.pointerId);
    setClickScale(0.9);
  }, []);

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (event.button !== 0) return;
      const wasDrag = drag.current.moved;
      drag.current.active = false;
      event.currentTarget.releasePointerCapture(event.pointerId);

      setClickScale(1.14);
      setTimeout(() => setClickScale(1), 160);

      if (!wasDrag) {
        if (timer?.running) {
          // Single left-click while running -> STOP tracking session cleanly
          void window.mochi.timer.stop().then(setTimer);
          setShowPills(false);
        } else {
          // Single left-click while stopped -> Reveal Category Quick-Trackers at bottom
          revealPills();
        }
      }
    },
    [timer, revealPills],
  );

  const running = timer?.running === true;
  const performing = phase !== 'none';
  const pose = magicianPose(phase);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', pointerEvents: 'none' }}>
      {/*
       * During a performance the message is withheld until Mochi has arrived.
       * The bubble and the entrance are triggered by the same event, so without
       * this the bubble is already on screen at the docked position and gets
       * carried across with the window — delivering the line before appearing.
       */}
      <SpeechBubble
        text={performing && !isAlertPhase(phase) ? null : bubble}
        onDismiss={dismissBubble}
        onHoverChange={setInteractive}
      />

      <div
        style={{
          position: 'absolute',
          right: 0,
          bottom: 0,
          width: MASCOT_BOX.width,
          height: MASCOT_BOX.height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* 3 Primary Floating Category Quick-Tracker Pills at the Bottom */}
        <OverlayCategoryPills
          timer={timer}
          visible={showPills}
          onHoverChange={(interactive) => {
            setInteractive(interactive);
            if (interactive) revealPills();
          }}
        />

        {/* Magician smoke and sparkles. Covers the window, above the mascot. */}
        <SmokeEffect mode={smokeMode(phase)} />

        {error !== null && (
          <div
            style={{
              color: '#ffb3c1',
              font: '11px system-ui, sans-serif',
              textAlign: 'center',
              padding: 8,
            }}
          >
            {error}
          </div>
        )}

        <canvas
          ref={(node) => {
            canvasRef.current = node;
            setCanvas(node);
          }}
          width={200}
          height={200}
          style={{
            width: '170px',
            height: '170px',
            display: 'block',
            // Nothing to click while a performance is running: a click would
            // stop the timer or open the pills mid-vanish.
            pointerEvents: performing ? 'none' : 'auto',
            // One transform, one transition. Scale and opacity are the only two
            // properties the compositor can animate without touching layout,
            // which is why this is smooth where moving the window was not.
            transform: `scale(${pose.scale * clickScale})`,
            opacity: pose.opacity,
            transition: `transform ${pose.durationMs}ms ${pose.easing}, opacity ${pose.durationMs}ms ${pose.easing}`,
            willChange: performing ? 'transform, opacity' : 'auto',
          }}
          onPointerMove={handlePointerMove}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerLeave={() => setInteractive(false)}
          onContextMenu={(e) => {
            e.preventDefault();
            window.mochi.window.openSettings();
          }}
        />

        {/* The stopwatch badge would otherwise hang in the air through the
            vanish, since it is not inside the mascot's transform. */}
        {running && timer !== null && !performing && (
          <div
            style={{
              position: 'absolute',
              bottom: 6,
              left: '50%',
              transform: 'translateX(-50%)',
              padding: '2px 9px',
              borderRadius: 999,
              background: 'rgba(27, 23, 32, 0.82)',
              color: '#f4eef6',
              font: '600 11px system-ui, sans-serif',
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            {formatDuration(timer.elapsedMs)}
          </div>
        )}
      </div>
    </div>
  );
}
