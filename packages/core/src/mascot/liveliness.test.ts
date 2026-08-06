import { describe, expect, it } from 'vitest';
import {
  carryTilt,
  livelyPose,
  livelyTransform,
  HOVER_SCALE,
  MAX_CARRY_TILT_DEG,
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
