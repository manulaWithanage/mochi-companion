import { describe, expect, it } from 'vitest';
import { OVERLAY_SIZE } from '../geometry/clamp.js';
import {
  ARC_END_DEG,
  ARC_START_DEG,
  MAX_ITEMS,
  radialFitsWindow,
  radialPlacements,
  radialRadius,
} from './radial.js';

/**
 * The mascot is anchored to the bottom-right of the window and its box is
 * 200×200, so its centre is 100px in from each of those two edges.
 */
const CENTRE = { x: OVERLAY_SIZE.width - 100, y: OVERLAY_SIZE.height - 100 };
const SIZES = [130, 170, 210];

describe('radialPlacements', () => {
  it('opens up and to the left, which is the only free space in the window', () => {
    for (const p of radialPlacements(5, 170)) {
      expect(p.angleDeg).toBeGreaterThanOrEqual(ARC_START_DEG);
      expect(p.angleDeg).toBeLessThanOrEqual(ARC_END_DEG);
    }
  });

  it('puts the first item high and the last item low-left', () => {
    const [first, ...rest] = radialPlacements(5, 170);
    const last = rest[rest.length - 1];
    expect(first?.y).toBeLessThan(0); // above the mascot
    expect(last?.x).toBeLessThan(0); // left of it
  });

  it('centres a lone item instead of parking it at the start angle', () => {
    // The `count - 1` divisor is where an off-by-one would strand it.
    const [only] = radialPlacements(1, 170);
    expect(only?.angleDeg).toBeCloseTo((ARC_START_DEG + ARC_END_DEG) / 2, 5);
  });

  it('spaces items evenly', () => {
    const gaps = radialPlacements(5, 170)
      .map((p) => p.angleDeg)
      .slice(1)
      .map((deg, i) => deg - (radialPlacements(5, 170)[i]?.angleDeg ?? 0));
    for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0] ?? 0, 5);
  });

  it('returns nothing for an empty menu', () => {
    expect(radialPlacements(0, 170)).toEqual([]);
  });

  it('never lays out more than the arc can space apart', () => {
    expect(radialPlacements(99, 170)).toHaveLength(MAX_ITEMS);
  });
});

describe('radialRadius', () => {
  it('grows with the mascot, so the gap stays constant', () => {
    expect(radialRadius(210)).toBeGreaterThan(radialRadius(130));
    expect(radialRadius(210) - 105).toBe(radialRadius(130) - 65);
  });
});

describe('radialFitsWindow', () => {
  it('fits a full menu at every mascot size', () => {
    // The window is fixed and cannot grow (RULE 3), so this is the assertion
    // that stops someone widening the arc or the radius into a clipped icon.
    for (const size of SIZES) {
      expect(radialFitsWindow(MAX_ITEMS, size, CENTRE, OVERLAY_SIZE)).toBe(true);
    }
  });

  it('catches a menu pushed outside the window', () => {
    // Sabotage: a radius far past anything the real sizes produce must fail,
    // or the check above proves nothing.
    expect(radialFitsWindow(MAX_ITEMS, 900, CENTRE, OVERLAY_SIZE)).toBe(false);
  });

  it('catches a window too small to hold the arc', () => {
    expect(radialFitsWindow(MAX_ITEMS, 170, CENTRE, { width: 200, height: 200 })).toBe(false);
  });
});
