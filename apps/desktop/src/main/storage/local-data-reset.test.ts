import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, parse } from 'node:path';
import { tmpdir } from 'node:os';
import { deleteOwnedLocalData } from './local-data-reset.js';

const createdDirectories: string[] = [];

afterEach(() => {
  for (const directory of createdDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('deleteOwnedLocalData', () => {
  it('deletes only Mochi-owned entries and preserves unrelated files', () => {
    const directory = mkdtempSync(join(tmpdir(), 'mochi-reset-'));
    createdDirectories.push(directory);
    writeFileSync(join(directory, 'mochi.db'), 'database');
    writeFileSync(join(directory, 'settings.json'), '{}');
    mkdirSync(join(directory, 'brain'));
    writeFileSync(join(directory, 'brain', 'brain.json'), 'private');
    writeFileSync(join(directory, 'keep-me.txt'), 'not owned by Mochi');

    expect(deleteOwnedLocalData(directory)).toEqual(['mochi.db', 'settings.json', 'brain']);
    expect(existsSync(join(directory, 'mochi.db'))).toBe(false);
    expect(existsSync(join(directory, 'brain'))).toBe(false);
    expect(existsSync(join(directory, 'keep-me.txt'))).toBe(true);
  });

  it('refuses a filesystem root', () => {
    const root = parse(process.cwd()).root;
    expect(() => deleteOwnedLocalData(root)).toThrow(/filesystem root/i);
  });
});
