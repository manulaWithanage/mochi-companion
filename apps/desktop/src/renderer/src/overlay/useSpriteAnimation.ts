import { useEffect, useRef } from 'react';
import type { LoadedSkin, MascotState } from '@mochi/core';

/**
 * Canvas 2D sprite-sheet animation with a hard frame budget (RULE 4).
 *
 * - Redraws only when the frame index actually changes, so an 8fps animation
 *   costs 8 draws per second regardless of display refresh rate.
 * - Cancels the rAF loop entirely when the overlay is hidden, occluded or
 *   the machine is asleep. Not "slows down" — stops.
 * - Halves the rate on battery.
 *
 * Idle CPU has to stay under 2%: an always-on desktop pet that spins a core
 * gets uninstalled, so this is a requirement rather than an optimisation.
 */

interface Options {
  canvas: HTMLCanvasElement | null;
  skin: LoadedSkin | null;
  state: MascotState;
  visible: boolean;
}

type Sheet = { image: HTMLImageElement; frames: number; fps: number; loop: boolean };

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('sprite sheet failed to decode'));
    img.src = dataUrl;
  });
}

export function useSpriteAnimation({ canvas, skin, state, visible }: Options): void {
  const sheetsRef = useRef<Partial<Record<MascotState, Sheet>>>({});
  const stateRef = useRef<MascotState>(state);
  const onBatteryRef = useRef(false);

  stateRef.current = state;

  // Decode sheets once per skin.
  useEffect(() => {
    let cancelled = false;
    if (skin === null) return;

    void (async () => {
      const decoded: Partial<Record<MascotState, Sheet>> = {};
      await Promise.all(
        Object.entries(skin.states).map(async ([name, sheet]) => {
          if (sheet === undefined) return;
          try {
            decoded[name as MascotState] = {
              image: await loadImage(sheet.dataUrl),
              frames: sheet.frames,
              fps: sheet.fps,
              loop: sheet.loop,
            };
          } catch (error) {
            console.error(`[sprite] ${name}:`, error);
          }
        }),
      );
      if (!cancelled) sheetsRef.current = decoded;
    })();

    return () => {
      cancelled = true;
    };
  }, [skin]);

  // Battery status halves the frame rate. Optional API — absence is fine.
  useEffect(() => {
    const nav = navigator as Navigator & {
      getBattery?: () => Promise<{ charging: boolean; addEventListener: EventListener }>;
    };
    if (typeof nav.getBattery !== 'function') return;

    let detach: (() => void) | undefined;
    void nav.getBattery().then((battery) => {
      const sync = (): void => {
        onBatteryRef.current = !battery.charging;
      };
      sync();
      const target = battery as unknown as EventTarget;
      target.addEventListener('chargingchange', sync);
      detach = () => target.removeEventListener('chargingchange', sync);
    });
    return () => detach?.();
  }, []);

  useEffect(() => {
    if (canvas === null || skin === null) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (ctx === null) return;

    // Stop completely rather than throttling — a hidden window must cost zero.
    if (!visible) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvas.clientWidth;
    const cssHeight = canvas.clientHeight;
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    ctx.imageSmoothingEnabled = false;

    let raf = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    let lastState: MascotState | null = null;
    let animationStart = performance.now();

    /**
     * Frames are scheduled with setTimeout at the exact next boundary, then
     * drawn inside a single rAF so the paint still lands in sync with the
     * compositor.
     *
     * A plain rAF loop fires at display refresh — 120+ times a second on a
     * high-refresh panel — and throws away all but 8 of those callbacks.
     * Measured at ~8% of a core; this schedules only the frames we actually
     * draw.
     */
    const scheduleNext = (delayMs: number): void => {
      if (disposed) return;
      timer = setTimeout(() => {
        raf = requestAnimationFrame(tick);
      }, delayMs);
    };

    const tick = (now: number): void => {
      if (disposed) return;

      const current = stateRef.current;
      const sheet = sheetsRef.current[current] ?? sheetsRef.current[skin.defaultState];
      if (sheet === undefined) {
        // Sheets may still be decoding on first paint.
        scheduleNext(100);
        return;
      }

      // Restart timing on a state change so animations always begin at frame 0.
      if (current !== lastState) {
        lastState = current;
        animationStart = now;
      }

      const fps = onBatteryRef.current ? Math.max(1, Math.floor(sheet.fps / 2)) : sheet.fps;
      const frameDuration = 1000 / fps;
      const elapsed = now - animationStart;
      const raw = Math.floor(elapsed / frameDuration);
      const index = sheet.loop ? raw % sheet.frames : Math.min(raw, sheet.frames - 1);

      const frameW = sheet.image.width / sheet.frames;
      const frameH = sheet.image.height;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(
        sheet.image,
        index * frameW,
        0,
        frameW,
        frameH,
        0,
        0,
        cssWidth * dpr,
        cssHeight * dpr,
      );

      // A non-looping animation on its last frame has nothing left to do.
      if (!sheet.loop && raw >= sheet.frames - 1) return;

      scheduleNext(Math.max(0, frameDuration - (elapsed % frameDuration)));
    };

    raf = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      if (timer !== undefined) clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [canvas, skin, visible]);
}
