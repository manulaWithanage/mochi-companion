import { describe, expect, it } from 'vitest';
import {
  ARRIVAL_TOTAL_MS,
  MAGICIAN,
  arrivalPose,
  isAlertPhase,
  magicianDuration,
  magicianPose,
  magicianSequence,
  smokeMode,
  type MagicianPhase,
} from './magician.js';

const ALL: readonly MagicianPhase[] = ['none', 'vanish', 'appear', 'hold', 'depart', 'restore'];

describe('magicianPose', () => {
  it('covers every phase', () => {
    for (const phase of ALL) {
      const pose = magicianPose(phase);
      expect(pose.durationMs).toBeGreaterThan(0);
      expect(pose.easing.length).toBeGreaterThan(0);
    }
  });

  it('hides the mascot completely on both exits', () => {
    // Anything above zero and the window move underneath becomes visible.
    expect(magicianPose('vanish').opacity).toBe(0);
    expect(magicianPose('depart').opacity).toBe(0);
  });

  it('shrinks rather than only fading, so the smoke reads as the cause', () => {
    expect(magicianPose('vanish').scale).toBeLessThan(0.5);
    expect(magicianPose('depart').scale).toBeLessThan(0.5);
  });

  it('arrives fully visible at full size', () => {
    expect(magicianPose('appear')).toMatchObject({ scale: 1, opacity: 1 });
    expect(magicianPose('none')).toMatchObject({ scale: 1, opacity: 1 });
  });

  it('overshoots on arrival', () => {
    // A linear arrival looks mechanical; the bounce is most of the life in it.
    const easing = magicianPose('appear').easing;
    const peak = Number(easing.replace(/[^0-9., ]/g, '').split(',')[1]);
    expect(peak).toBeGreaterThan(1);
  });
});

describe('smokeMode', () => {
  it('bursts outward while concealing and revealing on every phase transition', () => {
    expect(smokeMode('vanish')).toBe('burst');
    expect(smokeMode('appear')).toBe('burst');
    expect(smokeMode('depart')).toBe('burst');
    expect(smokeMode('restore')).toBe('burst');
  });

  it('draws nothing when idle or merely holding', () => {
    expect(smokeMode('none')).toBeNull();
    expect(smokeMode('hold')).toBeNull();
  });
});

describe('isAlertPhase', () => {
  it('wears the alert face from arrival until it leaves', () => {
    expect(isAlertPhase('appear')).toBe(true);
    expect(isAlertPhase('hold')).toBe(true);
    expect(isAlertPhase('depart')).toBe(true);
  });

  it('does not use the alert face while docked', () => {
    expect(isAlertPhase('none')).toBe(false);
    expect(isAlertPhase('restore')).toBe(false);
    // Still the normal face on the way out from the corner — the alert is
    // something that happens at centre screen.
    expect(isAlertPhase('vanish')).toBe(false);
  });
});

describe('magicianSequence', () => {
  it('runs the phases in performance order', () => {
    expect(magicianSequence(1000).map((s) => s.phase)).toEqual([
      'vanish',
      'appear',
      'hold',
      'depart',
      'restore',
      'none',
    ]);
  });

  it('only ever moves the window while the mascot is invisible', () => {
    // The whole design rests on this. A move during a visible phase is the
    // jank the glide version could not avoid.
    const steps = magicianSequence(1000);
    for (const [i, step] of steps.entries()) {
      if (step.moveTo === null) continue;
      const previous = steps[i - 1];
      expect(previous).toBeDefined();
      expect(magicianPose(previous!.phase).opacity).toBe(0);
    }
  });

  it('moves to centre before appearing and home before restoring', () => {
    const steps = magicianSequence(1000);
    expect(steps.find((s) => s.phase === 'appear')?.moveTo).toBe('centre');
    expect(steps.find((s) => s.phase === 'restore')?.moveTo).toBe('home');
  });

  it('waits longer than the fade it asked for, before moving', () => {
    // Main cannot see a CSS transition finish, so it over-waits deliberately.
    const vanish = magicianSequence(0).find((s) => s.phase === 'vanish');
    expect(vanish?.durationMs).toBeGreaterThan(MAGICIAN.vanishMs);
  });

  it('holds for as long as it was asked to', () => {
    expect(magicianSequence(5000).find((s) => s.phase === 'hold')?.durationMs).toBe(5000);
  });

  it('never produces a negative hold', () => {
    expect(magicianSequence(-1).find((s) => s.phase === 'hold')?.durationMs).toBe(0);
  });

  it('is slow enough to read as a performance', () => {
    // The original entrance was ~300ms end to end: the smoke had cleared
    // before the eye found the mascot.
    expect(magicianDuration(0)).toBeGreaterThan(1500);
  });

  it('accounts for the hold in the total', () => {
    expect(magicianDuration(3000) - magicianDuration(0)).toBe(3000);
  });
});

describe('arrivalPose', () => {
  it('starts hidden with no transition, so there is nothing to see yet', () => {
    const pre = arrivalPose('pre');
    expect(pre.opacity).toBe(0);
    expect(pre.scale).toBeLessThan(0.5);
    expect(pre.durationMs).toBe(0);
  });

  it('arrives exactly the way the alert entrance does', () => {
    // One vocabulary of movement: the dock arrival is the magician's `appear`,
    // overshoot and all, so the two never drift apart in feel.
    expect(arrivalPose('in')).toEqual(magicianPose('appear'));
  });

  it('holds `in` longer than the pose transition, so the smoke can finish', () => {
    expect(ARRIVAL_TOTAL_MS).toBeGreaterThan(magicianPose('appear').durationMs);
  });
});
