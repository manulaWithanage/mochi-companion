import { useEffect, useRef } from 'react';
import { pickVariant, type LoadedSkin, type MascotState } from '@mochi/core';

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

type Sheet = {
  image: HTMLImageElement;
  frames: number;
  fps: number;
  loop: boolean;
  /** One-shot breaks, already decoded. Only ever set on the base sheet. */
  variants?: readonly Sheet[];
  variantChance?: number;
};

/**
 * How long a state change takes to dissolve.
 *
 * Short enough that it reads as the same character changing rather than as a
 * transition effect, and long enough that it is not a cut.
 */
const CROSSFADE_MS = 160;

/**
 * Poll rate once a non-looping animation has finished. State changes arrive by
 * mutating `stateRef` — they do not re-run the effect — so the tick chain must
 * stay alive to notice one. Four checks a second, each a ref comparison and no
 * draw, keeps resume latency under 250ms at effectively zero cost.
 */
const FINISHED_POLL_MS = 250;

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
            /*
             * Variants decode alongside the base sheet and are allowed to fail
             * individually: a stretch that will not decode should cost the
             * stretch, not the state it belongs to. The main process already
             * drops ones whose file is missing, so this covers a corrupt PNG
             * rather than an absent one.
             */
            const variants = (
              await Promise.all(
                (sheet.variants ?? []).map(async (variant) => {
                  try {
                    return {
                      image: await loadImage(variant.dataUrl),
                      frames: variant.frames,
                      fps: variant.fps,
                      loop: false,
                    };
                  } catch (error) {
                    console.error(`[sprite] ${name} variant:`, error);
                    return null;
                  }
                }),
              )
            ).filter((variant): variant is Sheet => variant !== null);

            decoded[name as MascotState] = {
              image: await loadImage(sheet.dataUrl),
              frames: sheet.frames,
              fps: sheet.fps,
              loop: sheet.loop,
              ...(variants.length > 0 ? { variants } : {}),
              ...(variants.length > 0 && sheet.variantChance !== undefined
                ? { variantChance: sheet.variantChance }
                : {}),
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
    let cssWidth = canvas.clientWidth;
    let cssHeight = canvas.clientHeight;

    let raf = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    let lastState: MascotState | null = null;
    // Which frame is on the canvas, so a tick that lands on the same index
    // draws nothing. -1 means the canvas is blank (or stale) and must be drawn.
    let lastDrawnIndex = -1;
    let animationStart = performance.now();
    /** The sheet actually on screen: the state's base loop, or a variant. */
    let playing: Sheet | null = null;
    /** The outgoing frame, held only for the length of a cross-fade. */
    let fadingFrom: { sheet: Sheet; index: number } | null = null;
    let fadeStart = 0;

    const resizeBackingStore = (): void => {
      canvas.width = Math.round(cssWidth * dpr);
      canvas.height = Math.round(cssHeight * dpr);
      // Resizing wipes the canvas and resets context state; smoothing is
      // re-decided at draw time because it depends on the sheet's frame size.
      lastDrawnIndex = -1;
    };
    resizeBackingStore();

    /**
     * Mascot size is applied as a CSS width/height change in Overlay, which
     * does not re-run this effect — so the backing store must follow the
     * element itself. A stale backing store renders the sprite blurry AND
     * skews Overlay's pixel-alpha hover test, which maps pointer coordinates
     * against `canvas.width`/`canvas.height`. The redraw itself waits for the
     * next scheduled tick; resizes come from a settings dropdown, not a
     * per-frame animation.
     */
    const observer = new ResizeObserver(() => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w === cssWidth && h === cssHeight) return;
      cssWidth = w;
      cssHeight = h;
      resizeBackingStore();
    });
    observer.observe(canvas);

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
      const base = sheetsRef.current[current] ?? sheetsRef.current[skin.defaultState];
      if (base === undefined) {
        // Sheets may still be decoding on first paint.
        scheduleNext(100);
        return;
      }

      /*
       * A state change cross-fades rather than cutting.
       *
       * The old behaviour reset the clock and the next frame was simply a
       * different image, so idle to working snapped. A short dissolve costs
       * one extra drawImage for a sixth of a second and does more for how
       * finished the mascot looks than any amount of new art, because every
       * state change a user sees goes through it.
       *
       * The outgoing frame is captured here — it is still what is on the
       * canvas — rather than re-derived later from a clock that has moved on.
       */
      if (current !== lastState) {
        if (lastState !== null && lastDrawnIndex >= 0 && playing !== null) {
          fadingFrom = { sheet: playing, index: lastDrawnIndex };
          fadeStart = now;
        }
        lastState = current;
        playing = base;
        animationStart = now;
        lastDrawnIndex = -1;
      }

      if (playing === null) {
        playing = base;
        animationStart = now;
      }

      const sheet = playing;
      const fps = onBatteryRef.current ? Math.max(1, Math.floor(sheet.fps / 2)) : sheet.fps;
      const frameDuration = 1000 / fps;
      const elapsed = now - animationStart;
      const raw = Math.floor(elapsed / frameDuration);

      /*
       * A completed loop is where a variant gets its chance.
       *
       * Rolled on the cycle boundary rather than on a timer, so a variant
       * always begins from a pose the base loop has just returned to. Starting
       * one mid-breath would make the mascot jump.
       */
      if (sheet.loop && sheet === base && raw >= sheet.frames) {
        const variant = pickVariant(base, Math.random());
        if (variant !== null) {
          playing = variant;
          animationStart = now;
          lastDrawnIndex = -1;
          scheduleNext(0);
          return;
        }
        // No variant this time: fall through and keep looping the base.
      }

      const index = sheet.loop ? raw % sheet.frames : Math.min(raw, sheet.frames - 1);
      const fadeElapsed = fadingFrom === null ? Infinity : now - fadeStart;
      const fading = fadeElapsed < CROSSFADE_MS;
      if (!fading) fadingFrom = null;

      // During a fade the alpha changes every frame even when the sprite index
      // does not, so the redraw guard has to stand down for its duration.
      if (index !== lastDrawnIndex || fading) {
        lastDrawnIndex = index;

        /*
         * Nearest-neighbour only when a frame maps to a whole number of device
         * pixels. The sheets are 192px and the mascot draws at 130/170/210 CSS
         * px times whatever Windows display scaling multiplies in — almost
         * never an integer ratio — and unsmoothed non-integer sampling
         * duplicates some pixel rows and not others, which shimmers as frames
         * advance. Crisp when it can be, filtered when crisp would be uneven.
         */
        const frameW = sheet.image.width / sheet.frames;
        const frameH = sheet.image.height;
        const integerScale =
          Number.isInteger((cssWidth * dpr) / frameW) &&
          Number.isInteger((cssHeight * dpr) / frameH);
        ctx.imageSmoothingEnabled = !integerScale;
        if (!integerScale) ctx.imageSmoothingQuality = 'high';

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (fading && fadingFrom !== null) {
          const t = fadeElapsed / CROSSFADE_MS;
          const from = fadingFrom;
          const fromW = from.sheet.image.width / from.sheet.frames;
          ctx.globalAlpha = 1 - t;
          ctx.drawImage(
            from.sheet.image,
            from.index * fromW,
            0,
            fromW,
            from.sheet.image.height,
            0,
            0,
            cssWidth * dpr,
            cssHeight * dpr,
          );
          ctx.globalAlpha = t;
        }

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
        // Always restore: the next draw must not inherit a partial alpha.
        ctx.globalAlpha = 1;
      }

      // Run at display rate while dissolving. State changes are rare, so this
      // is a short burst rather than a standing cost.
      if (fading) {
        raf = requestAnimationFrame(tick);
        return;
      }

      /*
       * A finished variant hands the state back to its base loop.
       *
       * Checked before the generic non-looping branch below, which would
       * otherwise park the mascot on the last frame of a stretch for ever.
       */
      if (!sheet.loop && sheet !== base && raw >= sheet.frames - 1) {
        playing = base;
        animationStart = now;
        lastDrawnIndex = -1;
        scheduleNext(0);
        return;
      }

      // A non-looping animation on its last frame has nothing left to draw,
      // but the chain must not die here: nothing else restarts it, so exiting
      // outright froze the mascot on this frame until hide/show. Hold the
      // frame and idle at a slow poll — the draw guard above makes each poll
      // draw-free — so the next state change resumes animation.
      if (!sheet.loop && raw >= sheet.frames - 1) {
        scheduleNext(FINISHED_POLL_MS);
        return;
      }

      scheduleNext(Math.max(0, frameDuration - (elapsed % frameDuration)));
    };

    raf = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      observer.disconnect();
      if (timer !== undefined) clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [canvas, skin, visible]);
}
