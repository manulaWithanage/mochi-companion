import { useCallback, useEffect, useRef, useState, type JSX } from 'react';
import {
  formatDuration,
  MASCOT_BOX,
  type BubbleMessage,
  type LoadedSkin,
  type MascotState,
  type TimerSnapshot,
} from '@mochi/core';
import { useSpriteAnimation } from './useSpriteAnimation.js';
import { SpeechBubble } from './SpeechBubble.js';

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
  const bubbleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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

  // ---- speech bubble -----------------------------------------------------
  const dismissBubble = useCallback(() => {
    if (bubbleTimer.current !== undefined) clearTimeout(bubbleTimer.current);
    bubbleTimer.current = undefined;
    setBubble(null);
  }, []);

  useEffect(() => {
    const off = window.mochi.bubble.onShow((message: BubbleMessage) => {
      if (bubbleTimer.current !== undefined) clearTimeout(bubbleTimer.current);
      setBubble(message.text);
      bubbleTimer.current = setTimeout(dismissBubble, message.ttlMs);
    });
    return () => {
      off();
      if (bubbleTimer.current !== undefined) clearTimeout(bubbleTimer.current);
    };
  }, [dismissBubble]);

  // ---- subscriptions -----------------------------------------------------
  useEffect(() => {
    const offState = window.mochi.mascot.onStateChange(setMascotState);
    const offTimer = window.mochi.timer.onChange(setTimer);
    const offVisible = window.mochi.overlay.onVisibilityChange(setVisible);
    const offSettings = window.mochi.settings.onChange((next) => {
      void window.mochi.skin.load(next.skinName).then(setSkin).catch(() => undefined);
    });
    return () => {
      offState();
      offTimer();
      offVisible();
      offSettings();
    };
  }, []);

  // Page Visibility catches cases the main process cannot see, e.g. the
  // compositor throttling us while another app is fullscreen.
  useEffect(() => {
    const onChange = (): void => {
      if (document.visibilityState === 'hidden') setVisible(false);
      else setVisible(true);
    };
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);

  // Keep the running duration ticking while a session is open.
  useEffect(() => {
    if (timer === null || !timer.running || !visible) return;
    const id = setInterval(() => {
      void window.mochi.timer.current().then(setTimer);
    }, 1000);
    return () => clearInterval(id);
  }, [timer, visible]);

  /**
   * The window is click-through by default. `forward: true` keeps mousemove
   * flowing, so we sample the canvas alpha under the cursor and enable input
   * only over drawn pixels — clicks on the transparent corners still reach
   * whatever is behind Mochi.
   */
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

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    drag.current = { active: true, moved: false, x: event.screenX, y: event.screenY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const wasDrag = drag.current.moved;
    drag.current.active = false;
    event.currentTarget.releasePointerCapture(event.pointerId);

    // A click, not the end of a drag: toggle the stopwatch.
    if (!wasDrag) {
      void window.mochi.timer.toggle('default').then(setTimer);
    }
  }, []);

  const running = timer?.running === true;

  return (
    // Nothing here captures pointer events by default — the window is
    // click-through and only the mascot's own pixels re-enable input.
    <div style={{ width: '100%', height: '100%', position: 'relative', pointerEvents: 'none' }}>
      <SpeechBubble text={bubble} onDismiss={dismissBubble} onHoverChange={setInteractive} />

      {/*
        The mascot is anchored to the window's bottom-right. The window is a
        fixed size and never resizes; the space above and to the left is
        transparent and exists so a speech bubble has somewhere to go.
      */}
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
        {error !== null && (
          <div
            style={{
              color: '#ffb3c1',
              font: '11px system-ui, sans-serif',
              textAlign: 'center',
              padding: 8,
            }}
          >
            {/* textContent via React children — never innerHTML (RULE 1). */}
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
          style={{ width: '170px', height: '170px', display: 'block', pointerEvents: 'auto' }}
          onPointerMove={handlePointerMove}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerLeave={() => setInteractive(false)}
          onContextMenu={(e) => {
            e.preventDefault();
            window.mochi.window.openSettings();
          }}
        />

        {running && timer !== null && (
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
