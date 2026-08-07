import { describe, expect, it } from 'vitest';
import {
  carryTilt,
  livelyPose,
  livelyTransform,
  HOVER_LEAN_DEG,
  HOVER_SCALE,
  MAX_CARRY_TILT_DEG,
  PET_COOLDOWN_MS,
  PET_MIN_STROKE_PX,
  PettingDetector,
} from './liveliness.js';

const still = { hovered: false, pressed: false, carryVelocityX: 0 };

describe('carryTilt', () => {
  it('is upright when nothing is moving', () => {
    expect(carryTilt(0)).toBe(0);
  });

  it('leans the way the pointer is travelling', () => {
    expect(carryTilt(9)).toBeGreaterThan(0);
    expect(carryTilt(-9)).toBeLessThan(0);
  });

  it('is symmetric', () => {
    expect(carryTilt(-12)).toBeCloseTo(-carryTilt(12), 10);
  });

  it('never exceeds the clip-safe maximum', () => {
    // The overlay window is a fixed size and cannot grow around a rotated
    // child, so this bound is what keeps a large mascot off the window edge.
    for (const v of [50, 500, 5000, -50, -500, -5000]) {
      expect(Math.abs(carryTilt(v))).toBeLessThanOrEqual(MAX_CARRY_TILT_DEG);
    }
  });

  it('grows sub-linearly, so a flick is not a spin', () => {
    // Doubling the speed must add less than double the tilt, or the mascot
    // reads as a gauge needle rather than something with weight.
    const slow = carryTilt(4);
    const fast = carryTilt(8);
    expect(fast).toBeGreaterThan(slow);
    expect(fast).toBeLessThan(slow * 2);
  });
});

describe('livelyPose', () => {
  it('sits perfectly still when it is not being touched', () => {
    expect(livelyPose(still)).toEqual({ tiltDeg: 0, liftPx: 0, scale: 1 });
  });

  it('rises to meet the pointer on hover', () => {
    const pose = livelyPose({ ...still, hovered: true });
    expect(pose.scale).toBe(HOVER_SCALE);
    expect(pose.liftPx).toBeLessThan(0);
  });

  it('lets the press win over the hover', () => {
    // The pointer is always over the mascot while pressing it. Applying both
    // would grow and shrink at once and cancel the press feedback out.
    const pose = livelyPose({ ...still, hovered: true, pressed: true });
    expect(pose.scale).toBe(1);
    expect(pose.liftPx).toBe(0);
  });

  it('keeps tilting while carried, pressed or not', () => {
    expect(livelyPose({ hovered: true, pressed: true, carryVelocityX: 9 }).tiltDeg).toBeGreaterThan(
      0,
    );
  });

  it('leans toward the cursor while hovered', () => {
    expect(livelyPose({ ...still, hovered: true, hoverLeanX: 1 }).tiltDeg).toBe(HOVER_LEAN_DEG);
    expect(livelyPose({ ...still, hovered: true, hoverLeanX: -0.5 }).tiltDeg).toBe(
      -HOVER_LEAN_DEG / 2,
    );
  });

  it('ignores the lean when not hovered and while pressed', () => {
    expect(livelyPose({ ...still, hoverLeanX: 1 }).tiltDeg).toBe(0);
    expect(livelyPose({ ...still, hovered: true, pressed: true, hoverLeanX: 1 }).tiltDeg).toBe(0);
  });

  it('never lets lean plus carry exceed the clip-safe maximum', () => {
    const pose = livelyPose({ hovered: true, pressed: false, carryVelocityX: 500, hoverLeanX: 1 });
    expect(Math.abs(pose.tiltDeg)).toBeLessThanOrEqual(MAX_CARRY_TILT_DEG);
  });
});

describe('PettingDetector', () => {
  /** Stroke horizontally from `from` to `to` in a few samples. */
  const stroke = (d: PettingDetector, t: number, from: number, to: number): boolean => {
    const steps = 4;
    let hit = false;
    for (let i = 1; i <= steps; i++) {
      hit = d.sample(t + i, from + ((to - from) * i) / steps) || hit;
    }
    return hit;
  };

  it('detects back-and-forth strokes as petting', () => {
    const d = new PettingDetector();
    let detected = false;
    // Four strokes: three reversals, all well inside the window.
    detected = stroke(d, 0, 0, 40) || detected;
    detected = stroke(d, 100, 40, 0) || detected;
    detected = stroke(d, 200, 0, 40) || detected;
    detected = stroke(d, 300, 40, 0) || detected;
    expect(detected).toBe(true);
  });

  it('ignores pointer jitter that never travels a real stroke', () => {
    const d = new PettingDetector();
    let detected = false;
    // Reversals every sample, but each travels far less than a stroke.
    for (let i = 0; i < 40; i++) {
      detected = d.sample(i * 20, i % 2 === 0 ? 0 : PET_MIN_STROKE_PX / 4) || detected;
    }
    expect(detected).toBe(false);
  });

  it('ignores a single pass, however long', () => {
    const d = new PettingDetector();
    let detected = false;
    for (let i = 0; i < 30; i++) {
      detected = d.sample(i * 20, i * 15) || detected;
    }
    expect(detected).toBe(false);
  });

  it('fires once per session, then respects the cooldown', () => {
    const d = new PettingDetector();
    const pet = (at: number): boolean => {
      let hit = false;
      hit = stroke(d, at, 0, 40) || hit;
      hit = stroke(d, at + 100, 40, 0) || hit;
      hit = stroke(d, at + 200, 0, 40) || hit;
      hit = stroke(d, at + 300, 40, 0) || hit;
      return hit;
    };
    expect(pet(0)).toBe(true);
    // Still stroking inside the cooldown: stays quiet.
    expect(pet(1000)).toBe(false);
    // Well past the cooldown: a fresh session fires again.
    expect(pet(PET_COOLDOWN_MS + 2000)).toBe(true);
  });

  it('forgets a stroke in progress on reset', () => {
    const d = new PettingDetector();
    stroke(d, 0, 0, 40);
    stroke(d, 100, 40, 0);
    stroke(d, 200, 0, 40);
    d.reset();
    // One more reversal would have fired without the reset.
    expect(stroke(d, 300, 40, 0)).toBe(false);
  });
});

describe('livelyTransform', () => {
  it('composes to an identity transform at rest', () => {
    expect(livelyTransform(livelyPose(still), 1)).toBe('translateY(0px) scale(1) rotate(0deg)');
  });

  it('multiplies the press scale in rather than replacing it', () => {
    // The existing press/bounce feedback is passed through; losing it was the
    // easy mistake when adding a second source of scale.
    expect(livelyTransform(livelyPose({ ...still, hovered: true }), 0.9)).toContain(
      `scale(${Number((HOVER_SCALE * 0.9).toFixed(3))})`,
    );
  });

  it('translates before scaling, so the lift does not grow with the mascot', () => {
    const transform = livelyTransform(livelyPose({ ...still, hovered: true }), 1);
    expect(transform.indexOf('translateY')).toBeLessThan(transform.indexOf('scale'));
  });
});
