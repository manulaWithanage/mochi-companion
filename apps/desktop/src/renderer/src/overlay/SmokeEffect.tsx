import { useEffect, useRef, type JSX } from 'react';
import { OVERLAY_SIZE, type SmokeMode } from '@mochi/core';

/**
 * The puff of smoke and the sparkles.
 *
 * Three things the first version got wrong, all of which read as "not smooth":
 *
 * 1. **Frame-rate-dependent physics.** `p.x += p.vx` every frame means the
 *    whole effect runs 2.4x faster on a 144Hz display than on 60Hz. Everything
 *    here integrates against elapsed milliseconds instead, so it looks the same
 *    on any monitor.
 * 2. **A clipped canvas.** It was 170x170 pinned to the bottom-right of a
 *    340x300 window while the mascot sits centred in its own box, so smoke was
 *    cut off on two sides and off-centre. It now covers the whole window and is
 *    centred on the mascot.
 * 3. **No exit.** The canvas unmounted mid-particle — a hard cut. `gather`
 *    reverses the flow so the smoke draws back in before it goes.
 *
 * The rAF loop only runs while a phase is actually blowing smoke, and the
 * component unmounts otherwise, so this costs nothing when idle (RULE 4).
 */

interface Particle {
  /** Position, in canvas pixels. */
  x: number;
  y: number;
  /** Velocity, in canvas pixels per second. */
  vx: number;
  vy: number;
  radius: number;
  maxRadius: number;
  /** Seconds this particle lives for. */
  life: number;
  age: number;
  hue: string;
  /** Where it started, so `gather` can pull it back. */
  originX: number;
  originY: number;
}

interface Sparkle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  age: number;
  spin: number;
  rotation: number;
  colour: string;
}

/**
 * The magician's two smoke directions, plus `delight` — the sparkle-only burst
 * the mascot gives off when petted. Delight is deliberately not a SmokeMode:
 * core's `smokeMode()` maps magician phases and being petted is not a phase.
 */
export type OverlayEffectMode = SmokeMode | 'delight';

/** The canvas is the whole window so nothing clips at the edges. */
const W = OVERLAY_SIZE.width;
const H = OVERLAY_SIZE.height;

/**
 * Where the mascot's middle is.
 *
 * The mascot box is bottom-right anchored and 200x200, drawn at 170x170, so its
 * centre is 85px in from each of those edges. Smoke centred anywhere else looks
 * like it is happening next to Mochi rather than around Mochi.
 */
const CX = W - 100;
const CY = H - 100;

const SMOKE_TINTS = ['232, 219, 255', '255, 236, 246', '246, 240, 255'];
const SPARKLE_COLOURS = ['#ffd76a', '#ff94e8', '#9fd8ff', '#fff6c9'];

const rand = (min: number, max: number): number => min + Math.random() * (max - min);

/** Ease-out: fast to begin, settling at the end. Smoke decelerates as it spreads. */
const easeOut = (t: number): number => 1 - Math.pow(1 - t, 3);

function makeParticles(mode: OverlayEffectMode): Particle[] {
  // Petting earns sparkles, not smoke: a puff means Mochi is going somewhere.
  if (mode === 'delight') return [];
  // More, smaller puffs read as a cloud; the original 18 large circles read as
  // overlapping blobs.
  const count = mode === 'gather' ? 22 : 30;
  return Array.from({ length: count }, () => {
    const angle = rand(0, Math.PI * 2);
    // A ring rather than a point: smoke that all starts at one pixel looks like
    // an explosion, not a puff.
    const spread = rand(6, 26);
    const speed = rand(26, 74);
    const x = CX + Math.cos(angle) * spread;
    const y = CY + Math.sin(angle) * spread;
    return {
      x,
      y,
      originX: x,
      originY: y,
      vx: Math.cos(angle) * speed,
      // Biased upward: smoke rises, and it stops the cloud looking like a disc.
      vy: Math.sin(angle) * speed - rand(14, 34),
      radius: rand(7, 15),
      maxRadius: rand(30, 54),
      life: rand(0.62, 1.0),
      age: 0,
      hue: SMOKE_TINTS[Math.floor(rand(0, SMOKE_TINTS.length))] ?? SMOKE_TINTS[0]!,
    };
  });
}

function makeSparkles(mode: OverlayEffectMode): Sparkle[] {
  const count = mode === 'gather' ? 10 : mode === 'delight' ? 14 : 18;
  return Array.from({ length: count }, () => {
    const angle = rand(0, Math.PI * 2);
    // Petting sparkles drift rather than fly — the mascot is staying put.
    const speed = mode === 'delight' ? rand(30, 85) : rand(60, 150);
    return {
      x: CX + Math.cos(angle) * rand(0, 12),
      y: CY + Math.sin(angle) * rand(0, 12),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - rand(30, 70),
      size: rand(3, 7),
      life: rand(0.55, 0.95),
      age: 0,
      spin: rand(-5, 5),
      rotation: rand(0, Math.PI),
      colour: SPARKLE_COLOURS[Math.floor(rand(0, SPARKLE_COLOURS.length))] ?? '#ffd76a',
    };
  });
}

function drawStar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  outer: number,
  rotation: number,
  colour: string,
  alpha: number,
): void {
  const inner = outer / 2.6;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.beginPath();
  // Four points: a twinkle, not a pentagram.
  for (let i = 0; i < 8; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / 4) * i - Math.PI / 2;
    const px = Math.cos(a) * r;
    const py = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = colour;
  // The glow is what makes a flat polygon look like light.
  ctx.shadowColor = colour;
  ctx.shadowBlur = outer * 2.2;
  ctx.fill();
  ctx.restore();
}

export function SmokeEffect({ mode }: { readonly mode: OverlayEffectMode }): JSX.Element | null {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (mode === null) return;
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const ctx = canvas.getContext('2d');
    if (ctx === null) return;

    const particles = makeParticles(mode);
    const sparkles = makeSparkles(mode);
    const gathering = mode === 'gather';

    let raf = 0;
    let last = performance.now();
    let running = true;

    const render = (now: number): void => {
      // Clamped: a backgrounded window can hand back a delta of seconds, which
      // would teleport every particle off screen in one step.
      const dt = Math.min((now - last) / 1000, 1 / 20);
      last = now;

      ctx.clearRect(0, 0, W, H);
      let alive = false;

      for (const p of particles) {
        p.age += dt;
        const t = Math.min(1, p.age / p.life);
        if (t >= 1) continue;
        alive = true;

        if (gathering) {
          // Pull back toward the origin and shrink, so the cloud closes up.
          p.x = p.originX + (p.x - p.originX) * (1 - dt * 3.4);
          p.y = p.originY + (p.y - p.originY) * (1 - dt * 3.4);
          p.radius = Math.max(1, p.radius - dt * 44);
        } else {
          // Drag, so the spread decelerates instead of drifting at constant speed.
          p.vx *= 1 - dt * 1.7;
          p.vy *= 1 - dt * 1.7;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.radius = p.radius + (p.maxRadius - p.radius) * easeOut(dt * 3.2);
        }

        // Fade in briefly then out, so particles do not pop into existence at
        // full strength.
        const fadeIn = Math.min(1, p.age / 0.09);
        const alpha = 0.72 * fadeIn * (1 - easeOut(t));
        if (alpha <= 0.004) continue;

        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius);
        g.addColorStop(0, `rgba(${p.hue}, ${alpha})`);
        g.addColorStop(0.55, `rgba(${p.hue}, ${alpha * 0.45})`);
        g.addColorStop(1, `rgba(${p.hue}, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      for (const s of sparkles) {
        s.age += dt;
        const t = Math.min(1, s.age / s.life);
        if (t >= 1) continue;
        alive = true;

        if (gathering) {
          s.x += (CX - s.x) * dt * 3.2;
          s.y += (CY - s.y) * dt * 3.2;
        } else {
          s.vx *= 1 - dt * 1.2;
          // Gravity, so sparkles arc and fall rather than flying away flat.
          s.vy += 150 * dt;
          s.x += s.vx * dt;
          s.y += s.vy * dt;
        }
        s.rotation += s.spin * dt;

        // Twinkle rather than a linear fade — sparkles that dim evenly look
        // like dots, not light.
        const twinkle = 0.65 + 0.35 * Math.sin(s.age * 22);
        drawStar(ctx, s.x, s.y, s.size * (1 - t * 0.45), s.rotation, s.colour, (1 - t) * twinkle);
      }

      if (running && alive) raf = requestAnimationFrame(render);
      else ctx.clearRect(0, 0, W, H);
    };

    raf = requestAnimationFrame(render);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ctx.clearRect(0, 0, W, H);
    };
  }, [mode]);

  if (mode === null) return null;

  return (
    <canvas
      ref={canvasRef}
      width={W}
      height={H}
      style={{
        position: 'absolute',
        inset: 0,
        width: W,
        height: H,
        pointerEvents: 'none',
        // Above the mascot: smoke passing in front is what conceals it.
        zIndex: 20,
      }}
    />
  );
}
