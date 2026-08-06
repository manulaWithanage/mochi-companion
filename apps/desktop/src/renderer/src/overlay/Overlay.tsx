import { useCallback, useEffect, useRef, useState, type JSX } from 'react';
import {
  formatDuration,
  isAlertPhase,
  livelyPose,
  livelyTransform,
  magicianPose,
  MASCOT_BOX,
  smokeMode,
  type BubbleAction,
  type BubbleMessage,
  type LoadedSkin,
  type MagicianPhase,
  type MascotState,
  type MascotSize,
  type TimerSnapshot,
} from '@mochi/core';

const MASCOT_SIZE_MAP: Record<MascotSize, string> = {
  small: '130px',
  medium: '170px',
  large: '210px',
};
import { useSpriteAnimation } from './useSpriteAnimation.js';
import { SpeechBubble } from './SpeechBubble.js';
import { SmokeEffect } from './SmokeEffect.js';
import { OverlayCategoryPills } from './OverlayCategoryPills.js';
import { OverlayMochiActions, type MochiAction } from './OverlayMochiActions.js';
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
  // The three inputs to the mascot's reaction to being touched. Kept as state
  // rather than refs because the transform they produce is rendered.
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [carryVelocityX, setCarryVelocityX] = useState(0);
  // Mirrored here so the right-click row can light its toggles. Kept in step by
  // the settings subscription below, so flipping either from the dashboard is
  // reflected the next time the row opens.
  const [doNotDisturb, setDoNotDisturb] = useState(false);
  const [alwaysOnTop, setAlwaysOnTop] = useState(true);
  const [mascotSize, setMascotSize] = useState<MascotSize>('medium');
  const [visible, setVisible] = useState(true);
  const [timer, setTimer] = useState<TimerSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bubble, setBubble] = useState<string | null>(null);
  const [bubbleActions, setBubbleActions] = useState<readonly BubbleAction[]>([]);
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
        setMascotSize(settings.mascotSize ?? 'medium');
        setDoNotDisturb(settings.doNotDisturb);
        setAlwaysOnTop(settings.alwaysOnTop);
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
    setBubbleActions([]);

    if (bubbleSubject.current !== null) {
      window.mochi.bubble.dismiss(bubbleSubject.current);
      bubbleSubject.current = null;
    }
  }, []);

  /**
   * Press a button on the bubble.
   *
   * Hides the bubble the same way a TTL expiry does — deliberately *not* via
   * dismissBubble. Dismissing tells the governor "never raise this subject
   * again", which would make a snooze set a new time and then be silently
   * dropped when it arrived.
   */
  const runBubbleAction = useCallback((actionId: string) => {
    window.mochi.bubble.act(actionId);
    if (bubbleTimer.current !== undefined) clearTimeout(bubbleTimer.current);
    bubbleTimer.current = undefined;
    bubbleSubject.current = null;
    setBubble(null);
    setBubbleActions([]);
  }, []);

  useEffect(() => {
    const off = window.mochi.bubble.onShow((message: BubbleMessage) => {
      if (bubbleTimer.current !== undefined) clearTimeout(bubbleTimer.current);
      if (alertToneTimer.current !== undefined) clearTimeout(alertToneTimer.current);
      bubbleSubject.current = message.subject;
      setBubble(message.text);
      const actions = message.actions ?? [];
      setBubbleActions(actions);

      if (message.alertTone === 'gentle') {
        alertToneTimer.current = setTimeout(
          () => {
            alertToneTimer.current = undefined;
            void playGentleAlertTone().catch(() => undefined);
          },
          Math.max(0, message.alertToneDelayMs ?? 0),
        );
      }

      /*
       * A bubble that asks a question waits for the answer.
       *
       * Anything with buttons is a decision — Done, or later — and timing it out
       * silently is the one outcome the user never chose. Worse, an ignored
       * reminder is gone for good: the scheduler's watermark has already moved
       * past it, so it will not come round again. Fading it out after a few
       * seconds meant a reminder could be missed by looking away.
       *
       * Plain informational bubbles still expire on their own; those have
       * nothing to answer.
       */
      if (actions.length === 0) {
        bubbleTimer.current = setTimeout(() => {
          bubbleSubject.current = null;
          setBubble(null);
          setBubbleActions([]);
        }, message.ttlMs);
      } else {
        bubbleTimer.current = undefined;
      }
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
      setMascotSize(next.mascotSize ?? 'medium');
      setDoNotDisturb(next.doNotDisturb);
      setAlwaysOnTop(next.alwaysOnTop);
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

  /**
   * Also the hover signal for the mascot's own reaction.
   *
   * This is already a pixel-accurate test — it samples the canvas alpha, so it
   * is true only over the drawn body and not the transparent corners of the
   * frame. Adding an `onPointerEnter` beside it would have given a second,
   * worse answer to the same question, true across the whole square.
   *
   * Set inside the change guard, so it fires on transitions rather than on
   * every sample.
   */
  const setInteractive = useCallback((next: boolean) => {
    if (interactiveRef.current === next) return;
    interactiveRef.current = next;
    setHovered(next);
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
          // Feeds the carry lean. Holding still mid-drag sends 0 on the next
          // move, which returns the mascot upright while it is still held —
          // which is what something hanging from your hand actually does.
          setCarryVelocityX(dx);
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

  /**
   * Which icon row is showing, if either.
   *
   * **One value, not two booleans.** The two rows share the same strip under
   * the mascot, so this makes "both at once" unrepresentable rather than merely
   * unlikely — and both-at-once is exactly what sank the radial menu, which
   * tracked its own visibility separately from the pills and ended up drawn
   * over them.
   */
  const [row, setRow] = useState<'none' | 'projects' | 'mochi'>('none');
  const pillsTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const revealRow = useCallback((which: 'projects' | 'mochi') => {
    setRow(which);
    if (pillsTimer.current !== undefined) clearTimeout(pillsTimer.current);
    pillsTimer.current = setTimeout(() => setRow('none'), 4500);
  }, []);

  const revealPills = useCallback(() => revealRow('projects'), [revealRow]);

  const [clickScale, setClickScale] = useState(1);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return;
    drag.current = { active: true, moved: false, x: event.screenX, y: event.screenY };
    event.currentTarget.setPointerCapture(event.pointerId);
    setClickScale(0.9);
    setPressed(true);
  }, []);

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (event.button !== 0) return;
      const wasDrag = drag.current.moved;
      drag.current.active = false;
      event.currentTarget.releasePointerCapture(event.pointerId);

      setClickScale(1.14);
      setTimeout(() => setClickScale(1), 160);
      setPressed(false);
      // Springs back to upright through the same 160ms ease as everything
      // else, which reads as the mascot settling after being put down.
      setCarryVelocityX(0);

      if (!wasDrag) {
        if (timer?.running) {
          // Single left-click while running -> STOP tracking session cleanly
          void window.mochi.timer.stop().then(setTimer);
          // Clears whichever row is up, not just the projects one — stopping is
          // a finished action and neither row has anything left to offer.
          setRow('none');
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
  // Hover is suppressed during a performance: the canvas takes no pointer
  // events while one runs, so a hover entered just beforehand would otherwise
  // stay stuck on through the whole vanish.
  const lively = livelyPose({ hovered: hovered && !performing, pressed, carryVelocityX });

  /**
   * Mochi's own controls, for the right-click row.
   *
   * Everything here already existed and was reachable only by opening the
   * window and finding the right tab, which is the wrong place for switches you
   * flip when a meeting starts.
   *
   * `paused` and `doNotDisturb` sound alike and are not: pausing hides the
   * mascot and stops routines scheduling at all, while Do Not Disturb leaves
   * Mochi on screen and stops the governor raising anything unprompted. The
   * labels have to carry that difference, because the icons cannot.
   */
  const mochiActions: readonly MochiAction[] = [
    {
      id: 'open',
      icon: 'window',
      label: 'Open Mochi',
      onPick: () => window.mochi.window.openSettings(),
    },
    {
      id: 'dnd',
      icon: 'moon',
      label: doNotDisturb ? 'Do Not Disturb is on' : 'Do Not Disturb — stay visible, stay quiet',
      active: doNotDisturb,
      onPick: () => {
        const next = !doNotDisturb;
        setDoNotDisturb(next);
        void window.mochi.settings.setDoNotDisturb(next);
      },
    },
    {
      id: 'ontop',
      icon: 'pin',
      label: alwaysOnTop ? 'Always on top is on' : 'Keep Mochi above other windows',
      active: alwaysOnTop,
      onPick: () => {
        const next = !alwaysOnTop;
        setAlwaysOnTop(next);
        void window.mochi.settings.setAlwaysOnTop(next);
      },
    },
    {
      id: 'hide',
      icon: 'hide',
      // Says where Mochi went. Pressing this removes the only thing on screen
      // that can bring it back, and the tray icon is precisely what nobody
      // knows about — an unexplained disappearance reads as a crash.
      label: 'Hide Mochi — bring it back from the tray',
      onPick: () => {
        setRow('none');
        void window.mochi.settings.setPaused(true);
      },
    },
  ];

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', pointerEvents: 'none' }}>
      {/* Magician smoke and sparkles. Covers the window, above the mascot. */}
      <SmokeEffect mode={smokeMode(phase)} />

      <SpeechBubble
        /*
         * During a centre-screen entrance the bubble belongs to `hold` alone.
         *
         * It used to show across the whole alert — `appear`, `hold` and
         * `depart` — so the speech arrived before the speaker. The mascot
         * springs in over 760ms while the bubble is fully faded in after 200,
         * which reads as a label appearing and Mochi catching up to it. On the
         * way out it was worse: Mochi shrank into the smoke with the bubble
         * still hanging there, talking after leaving.
         *
         * `hold` is also when the chime already plays — `alertToneDelayMs` is
         * 1150ms, which is exactly vanish + settle + appear. The sound was
         * timed to the landing and the words were not.
         */
        text={performing && phase !== 'hold' ? null : bubble}
        actions={bubbleActions}
        onAction={runBubbleAction}
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
          visible={row === 'projects'}
          onHoverChange={(interactive) => {
            setInteractive(interactive);
            // Hovering the row keeps it up. Without this it slides away at 4.5
            // seconds while the pointer is still on it, mid-decision.
            if (interactive) revealRow('projects');
          }}
        />

        <OverlayMochiActions
          actions={mochiActions}
          visible={row === 'mochi'}
          onHoverChange={(interactive) => {
            setInteractive(interactive);
            if (interactive) revealRow('mochi');
          }}
        />

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
            width: MASCOT_SIZE_MAP[mascotSize] ?? '170px',
            height: MASCOT_SIZE_MAP[mascotSize] ?? '170px',
            display: 'block',
            // Nothing to click while a performance is running: a click would
            // stop the timer or open the pills mid-vanish.
            pointerEvents: performing ? 'none' : 'auto',
            // One transform, one transition. Transform and opacity are the only
            // two properties the compositor can animate without touching
            // layout, which is why this is smooth where moving the window was
            // not — and why the hover and carry reactions ride on this single
            // string rather than adding properties of their own.
            //
            // The magician's scale and the press feedback multiply together
            // into the scale term, so a performance still overrides everything
            // and the press bounce survives.
            transform: livelyTransform(lively, pose.scale * clickScale),
            opacity: pose.opacity,
            transition: `transform ${pose.durationMs}ms ${pose.easing}, opacity ${pose.durationMs}ms ${pose.easing}`,
            willChange: performing ? 'transform, opacity' : 'auto',
          }}
          onPointerMove={handlePointerMove}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={(e) => {
            drag.current.active = false;
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
              e.currentTarget.releasePointerCapture(e.pointerId);
            }
            setClickScale(1);
            setPressed(false);
            setCarryVelocityX(0);
          }}
          onPointerLeave={() => {
            setInteractive(false);
            // A pointer that leaves mid-drag never sends another move, so the
            // lean would stay frozen at whatever angle it left on.
            setCarryVelocityX(0);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            /*
             * Right-click shows the icon row, rather than opening Settings.
             *
             * Settings is still one press away — the row ends with a button
             * for it — so nothing is lost, and the gesture now surfaces every
             * action instead of jumping straight to one destination nobody
             * knew was there.
             *
             * A ring arced around the mascot was tried here first and removed.
             * It duplicated a row that already existed and did the same job,
             * and having both on screen at once was worse than either alone.
             */
            revealRow('mochi');
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
              background: 'rgba(32, 24, 40, 0.95)',
              color: '#ffffff',
              border: '1px solid rgba(242, 166, 179, 0.4)',
              boxShadow: '0 4px 14px rgba(0, 0, 0, 0.75), 0 0 12px rgba(242, 166, 179, 0.25)',
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
