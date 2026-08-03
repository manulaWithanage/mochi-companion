/**
 * User Routines persistence — a JSON store in userData.
 *
 * Populates default presets on first run, and allows users to add, edit,
 * toggle, and delete daily/weekly routines with custom icons and multiple times.
 */

import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { app } from 'electron';
import { ROUTINE_PRESETS, type UserRoutine, type UserRoutineInput } from '@mochi/core';

export class UserRoutinesVault {
  private readonly filePath: string;
  private cache: UserRoutine[];
  private readonly listeners = new Set<(routines: readonly UserRoutine[]) => void>();

  constructor(filePath?: string) {
    this.filePath = filePath ?? join(app.getPath('userData'), 'user-routines.json');
    this.cache = this.read();
  }

  private read(): UserRoutine[] {
    try {
      const raw = readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as UserRoutine[];
      if (Array.isArray(parsed)) return parsed;
      return this.defaultRoutines();
    } catch {
      const defaults = this.defaultRoutines();
      this.cache = defaults;
      this.write();
      return defaults;
    }
  }

  private defaultRoutines(): UserRoutine[] {
    const now = Date.now();
    return ROUTINE_PRESETS.map((preset, index) => ({
      ...preset,
      id: `preset-${index + 1}`,
      createdAt: now + index,
    }));
  }

  private write(): void {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      const tmp = `${this.filePath}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.cache, null, 2), 'utf8');
      renameSync(tmp, this.filePath);
    } catch (error) {
      console.error('[user-routines] failed to persist:', error);
    }
  }

  private notify(): void {
    for (const listener of this.listeners) listener(this.cache);
  }

  list(): readonly UserRoutine[] {
    return this.cache;
  }

  private static editableFields(
    input: UserRoutineInput,
  ): Omit<UserRoutine, 'id' | 'enabled' | 'createdAt'> {
    const message = input.reminderMessage?.trim() ?? '';
    const icon = input.icon?.trim() ?? '';
    // `time` stays the primary for older records; `times` is the real list.
    const timesList =
      input.times !== undefined && input.times.length > 0 ? input.times : [input.time];

    return {
      title: input.title.trim() || 'Untitled Routine',
      time: timesList[0] ?? input.time,
      times: timesList,
      days: input.days,
      category: input.category,
      mochiReminder: input.mochiReminder,
      // Blank optional fields are omitted, never stored as `undefined` — the
      // stored type treats "no icon" as an absent key, and a JSON round trip
      // would drop an explicit undefined anyway, so writing one would make the
      // in-memory cache and the file on disk disagree.
      ...(icon.length > 0 ? { icon } : {}),
      ...(message.length > 0 ? { reminderMessage: message } : {}),
    };
  }

  save(input: UserRoutineInput & { id?: string }): readonly UserRoutine[] {
    if (input.id) {
      this.cache = this.cache.map((routine) => {
        if (routine.id !== input.id) return routine;
        const {
          reminderMessage: _cleared,
          icon: _iconCleared,
          times: _timesCleared,
          ...keep
        } = routine;
        return { ...keep, ...UserRoutinesVault.editableFields(input) };
      });
    } else {
      const newRoutine: UserRoutine = {
        id: `routine-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        enabled: true,
        createdAt: Date.now(),
        ...UserRoutinesVault.editableFields(input),
      };
      this.cache = [newRoutine, ...this.cache];
    }
    this.write();
    this.notify();
    return this.cache;
  }

  toggle(id: string): readonly UserRoutine[] {
    this.cache = this.cache.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r));
    this.write();
    this.notify();
    return this.cache;
  }

  remove(id: string): readonly UserRoutine[] {
    this.cache = this.cache.filter((r) => r.id !== id);
    this.write();
    this.notify();
    return this.cache;
  }

  onChange(listener: (routines: readonly UserRoutine[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
