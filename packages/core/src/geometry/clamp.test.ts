import { describe, expect, it } from 'vitest';
import {
  clampPosition,
  clampToDisplays,
  defaultPosition,
  displayContaining,
  resolvePlacement,
  type DisplayInfo,
} from './clamp.js';

const SIZE = { width: 200, height: 200 };

const laptop: DisplayInfo = {
  id: 1,
  workArea: { x: 0, y: 0, width: 1920, height: 1040 },
};
// A second monitor positioned to the left, as Windows reports it.
const external: DisplayInfo = {
  id: 2,
  workArea: { x: -2560, y: 0, width: 2560, height: 1400 },
};

describe('clampPosition', () => {
  it('leaves an in-bounds position alone', () => {
    expect(clampPosition({ x: 100, y: 100 }, SIZE, laptop.workArea)).toEqual({ x: 100, y: 100 });
  });

  it('pulls a window back from the right and bottom edges', () => {
    expect(clampPosition({ x: 5000, y: 5000 }, SIZE, laptop.workArea)).toEqual({
      x: 1720,
      y: 840,
    });
  });

  it('pulls a window back from negative coordinates', () => {
    expect(clampPosition({ x: -500, y: -500 }, SIZE, laptop.workArea)).toEqual({ x: 0, y: 0 });
  });

  it('respects a work area with a non-zero origin', () => {
    expect(clampPosition({ x: -9999, y: 0 }, SIZE, external.workArea)).toEqual({
      x: -2560,
      y: 0,
    });
  });

  it('prefers the top-left when the window is larger than the work area', () => {
    const tiny = { x: 0, y: 0, width: 100, height: 100 };
    expect(clampPosition({ x: 50, y: 50 }, SIZE, tiny)).toEqual({ x: 0, y: 0 });
  });
});

describe('defaultPosition', () => {
  it('rests in the bottom-right with a margin', () => {
    expect(defaultPosition(SIZE, laptop.workArea)).toEqual({ x: 1696, y: 816 });
  });
});

describe('resolvePlacement', () => {
  it('uses the default spot on first run', () => {
    const r = resolvePlacement(null, SIZE, [laptop], 1);
    expect(r.position).toEqual(defaultPosition(SIZE, laptop.workArea));
    expect(r.relocated).toBe(false);
  });

  it('restores a valid saved position untouched', () => {
    const r = resolvePlacement({ x: 300, y: 400, displayId: 1 }, SIZE, [laptop], 1);
    expect(r.position).toEqual({ x: 300, y: 400 });
    expect(r.displayId).toBe(1);
    expect(r.relocated).toBe(false);
  });

  it('rehomes to primary when the saved monitor was unplugged', () => {
    // Mochi was on the external monitor; it is gone this boot.
    const r = resolvePlacement({ x: -1000, y: 200, displayId: 2 }, SIZE, [laptop], 1);
    expect(r.displayId).toBe(1);
    expect(r.relocated).toBe(true);
    expect(r.position).toEqual(defaultPosition(SIZE, laptop.workArea));
  });

  it('keeps the mascot on a still-connected secondary monitor', () => {
    const r = resolvePlacement({ x: -1000, y: 200, displayId: 2 }, SIZE, [laptop, external], 1);
    expect(r.displayId).toBe(2);
    expect(r.position).toEqual({ x: -1000, y: 200 });
  });

  it('clamps a saved position that no longer fits after a resolution change', () => {
    const shrunk: DisplayInfo = { id: 1, workArea: { x: 0, y: 0, width: 800, height: 600 } };
    const r = resolvePlacement({ x: 1700, y: 900, displayId: 1 }, SIZE, [shrunk], 1);
    expect(r.position).toEqual({ x: 600, y: 400 });
    expect(r.relocated).toBe(true);
  });

  it('falls back to the first display when the primary id is unknown', () => {
    const r = resolvePlacement(null, SIZE, [external], 99);
    expect(r.displayId).toBe(2);
  });

  it('survives an empty display list without throwing', () => {
    const r = resolvePlacement({ x: 10, y: 10, displayId: 1 }, SIZE, [], 1);
    expect(r.position).toEqual({ x: 0, y: 0 });
    expect(r.relocated).toBe(true);
  });
});

describe('displayContaining', () => {
  it('finds the display holding a point', () => {
    expect(displayContaining({ x: 100, y: 100 }, [laptop, external])?.id).toBe(1);
    expect(displayContaining({ x: -100, y: 100 }, [laptop, external])?.id).toBe(2);
  });

  it('returns null for a point in no display', () => {
    expect(displayContaining({ x: 99_999, y: 0 }, [laptop])).toBeNull();
  });
});

describe('clampToDisplays', () => {
  it('allows smooth cross-boundary movement across multi-monitors', () => {
    const rightMonitor: DisplayInfo = {
      id: 2,
      workArea: { x: 1920, y: 0, width: 1920, height: 1080 },
    };
    const res = clampToDisplays({ x: 1800, y: 100 }, SIZE, [laptop, rightMonitor], 1);
    expect(res.position.x).toBe(1800);
  });

  it('clamps correctly when dragged past the far right of the multi-monitor setup', () => {
    const res = clampToDisplays({ x: 5000, y: 100 }, SIZE, [laptop], 1);
    expect(res.position).toEqual({ x: 1720, y: 100 });
  });

  it('clamps correctly when dragged past the top edge', () => {
    const res = clampToDisplays({ x: 500, y: -500 }, SIZE, [laptop], 1);
    expect(res.position.y).toBe(0);
  });
});
