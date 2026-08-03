import { describe, expect, it } from 'vitest';
import { categoryIcon, categoryLabel } from './category.js';

describe('categoryIcon', () => {
  it('takes the leading emoji', () => {
    expect(categoryIcon('💼 Work Time')).toBe('💼');
    expect(categoryIcon('🎯 General')).toBe('🎯');
  });

  it('keeps multi-unit emoji whole', () => {
    // The bug this replaces: slice(0, 2) cuts these apart and renders a
    // different glyph than the one the user picked. Both are in the pickers.
    expect(categoryIcon('🏋️ Gym')).toBe('🏋️');
    expect(categoryIcon('🧘‍♂️ Yoga')).toBe('🧘‍♂️');
    expect('🏋️'.slice(0, 2)).not.toBe('🏋️'); // the old behaviour, pinned
    expect('🧘‍♂️'.slice(0, 2)).not.toBe('🧘‍♂️');
  });

  it('keeps skin-tone modifiers attached', () => {
    expect(categoryIcon('👋🏽 Greeting')).toBe('👋🏽');
  });

  it('falls back when the name has no emoji', () => {
    expect(categoryIcon('Work Time')).toBe('🎯');
    expect(categoryIcon('')).toBe('🎯');
    expect(categoryIcon('  ')).toBe('🎯');
  });

  it('honours a caller-supplied fallback', () => {
    expect(categoryIcon('Work Time', '⏱')).toBe('⏱');
  });

  it('does not treat a leading digit or letter as an icon', () => {
    expect(categoryIcon('2026 Planning')).toBe('🎯');
  });
});

describe('categoryLabel', () => {
  it('drops the leading emoji and the space after it', () => {
    expect(categoryLabel('💼 Work Time')).toBe('Work Time');
    expect(categoryLabel('🧘‍♂️ Yoga')).toBe('Yoga');
    expect(categoryLabel('🏋️ Gym')).toBe('Gym');
  });

  it('leaves a name with no emoji alone', () => {
    expect(categoryLabel('Work Time')).toBe('Work Time');
  });

  it('survives a name that is only an emoji', () => {
    expect(categoryLabel('💼')).toBe('');
  });

  it('keeps emoji that appear later in the name', () => {
    expect(categoryLabel('Work 💼 Time')).toBe('Work 💼 Time');
  });
});
