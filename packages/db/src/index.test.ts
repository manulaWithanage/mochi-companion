import { describe, expect, it } from 'vitest';
import { LATEST_VERSION, MIGRATIONS, pendingMigrations } from './index.js';

describe('migrations', () => {
  it('has unique, ascending versions starting at 1', () => {
    const versions = MIGRATIONS.map((m) => m.version);
    expect(new Set(versions).size).toBe(versions.length);
    expect([...versions].sort((a, b) => a - b)).toEqual(versions);
    expect(versions[0]).toBe(1);
  });

  it('reports the latest version', () => {
    expect(LATEST_VERSION).toBe(MIGRATIONS[MIGRATIONS.length - 1]!.version);
  });

  it('returns everything for a fresh database', () => {
    expect(pendingMigrations(0)).toHaveLength(MIGRATIONS.length);
  });

  it('returns nothing for an up-to-date database', () => {
    expect(pendingMigrations(LATEST_VERSION)).toHaveLength(0);
  });

  it('returns nothing for a database from a newer Mochi', () => {
    // Downgrade: refuse to act rather than corrupt data.
    expect(pendingMigrations(LATEST_VERSION + 5)).toHaveLength(0);
  });
});
