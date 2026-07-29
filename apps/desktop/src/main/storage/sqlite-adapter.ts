/**
 * StorageAdapter backed by `node:sqlite`.
 *
 * Deliberately NOT better-sqlite3. Electron 43 bundles Node 24, which ships
 * SQLite in core — so there is no native addon, no node-gyp, no
 * @electron/rebuild step, and no MSVC/Xcode requirement for contributors or
 * CI. `pnpm install` works on a clean machine.
 *
 * packages/core owns the StorageAdapter interface, so swapping the driver
 * later touches only this file (RULE 2).
 */

import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import type {
  Project,
  SessionQuery,
  SessionId,
  StorageAdapter,
  Task,
  WorkSession,
} from '@mochi/core';
import {
  CONNECTION_PRAGMAS,
  DEFAULT_PROJECT,
  LATEST_VERSION,
  pendingMigrations,
  RUNNING_SESSION_KEY,
} from '@mochi/db';

interface ProjectRow {
  id: string;
  name: string;
  colour: string;
  created_at: number;
  archived_at: number | null;
}

interface TaskRow {
  id: string;
  title: string;
  project_id: string | null;
  due_on: string | null;
  done_at: number | null;
  created_at: number;
  priority: number;
}

interface SessionRow {
  id: string;
  project_id: string;
  started_at: number;
  ended_at: number | null;
}

/**
 * node:sqlite types rows as Record<string, SQLOutputValue>. The column set is
 * fixed by our own migrations, so narrowing here is safe — but it goes
 * through `unknown` so the cast is explicit rather than silently structural.
 */
const asRows = <T>(rows: unknown): T[] => rows as T[];

const toProject = (row: ProjectRow): Project => ({
  id: row.id,
  name: row.name,
  colour: row.colour,
  createdAt: row.created_at,
  archivedAt: row.archived_at,
});

const toTask = (row: TaskRow): Task => ({
  id: row.id,
  title: row.title,
  projectId: row.project_id,
  dueOn: row.due_on,
  doneAt: row.done_at,
  createdAt: row.created_at,
  priority: row.priority,
});

const toSession = (row: SessionRow): WorkSession => ({
  id: row.id,
  projectId: row.project_id,
  startedAt: row.started_at,
  endedAt: row.ended_at,
});

export class SqliteStorageAdapter implements StorageAdapter {
  private readonly db: DatabaseSync;
  private readonly statements: {
    insertSession: StatementSync;
    deleteSession: StatementSync;
    insertProject: StatementSync;
    archiveProject: StatementSync;
    listProjects: StatementSync;
    getState: StatementSync;
    setState: StatementSync;
    clearState: StatementSync;
    listTasks: StatementSync;
    upsertTask: StatementSync;
    deleteTask: StatementSync;
  };

  constructor(filePath: string) {
    mkdirSync(dirname(filePath), { recursive: true });
    this.db = new DatabaseSync(filePath);

    for (const pragma of CONNECTION_PRAGMAS) {
      this.db.exec(pragma);
    }
    this.migrate();
    this.seedDefaultProject();

    this.statements = {
      insertSession: this.db.prepare(
        `INSERT INTO sessions (id, project_id, started_at, ended_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           project_id = excluded.project_id,
           started_at = excluded.started_at,
           ended_at   = excluded.ended_at`,
      ),
      deleteSession: this.db.prepare(`DELETE FROM sessions WHERE id = ?`),
      insertProject: this.db.prepare(
        `INSERT INTO projects (id, name, colour, created_at, archived_at)
         VALUES (?, ?, ?, ?, NULL)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, colour = excluded.colour`,
      ),
      archiveProject: this.db.prepare(`UPDATE projects SET archived_at = ? WHERE id = ?`),
      listProjects: this.db.prepare(
        `SELECT * FROM projects WHERE archived_at IS NULL ORDER BY created_at ASC`,
      ),
      getState: this.db.prepare(`SELECT value FROM app_state WHERE key = ?`),
      setState: this.db.prepare(
        `INSERT INTO app_state (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      ),
      clearState: this.db.prepare(`DELETE FROM app_state WHERE key = ?`),
      listTasks: this.db.prepare(
        `SELECT * FROM tasks ORDER BY done_at IS NOT NULL, priority DESC, created_at ASC`,
      ),
      upsertTask: this.db.prepare(
        `INSERT INTO tasks (id, title, project_id, due_on, done_at, created_at, priority)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           title      = excluded.title,
           project_id = excluded.project_id,
           due_on     = excluded.due_on,
           done_at    = excluded.done_at,
           priority   = excluded.priority`,
      ),
      deleteTask: this.db.prepare(`DELETE FROM tasks WHERE id = ?`),
    };
  }

  private migrate(): void {
    const row = this.db.prepare('PRAGMA user_version').get() as
      { user_version: number } | undefined;
    const current = row?.user_version ?? 0;

    if (current > LATEST_VERSION) {
      // Database written by a newer Mochi. Refuse to migrate rather than
      // corrupt it; the caller falls back to in-memory storage.
      throw new Error(
        `Database schema v${current} is newer than this build supports (v${LATEST_VERSION}).`,
      );
    }

    for (const migration of pendingMigrations(current)) {
      this.db.exec('BEGIN');
      try {
        this.db.exec(migration.up);
        // PRAGMA does not accept bound parameters; version is an integer
        // literal from our own migration list, never user input.
        this.db.exec(`PRAGMA user_version = ${migration.version}`);
        this.db.exec('COMMIT');
      } catch (error) {
        this.db.exec('ROLLBACK');
        throw error;
      }
    }
  }

  private seedDefaultProject(): void {
    const existing = this.db.prepare('SELECT COUNT(*) AS n FROM projects').get() as { n: number };
    if (existing.n > 0) return;
    this.db
      .prepare('INSERT INTO projects (id, name, colour, created_at) VALUES (?, ?, ?, ?)')
      .run(DEFAULT_PROJECT.id, DEFAULT_PROJECT.name, DEFAULT_PROJECT.colour, Date.now());
  }

  async listProjects(): Promise<readonly Project[]> {
    return asRows<ProjectRow>(this.statements.listProjects.all()).map(toProject);
  }

  async createProject(input: Omit<Project, 'createdAt' | 'archivedAt'>): Promise<Project> {
    const createdAt = Date.now();
    this.statements.insertProject.run(input.id, input.name, input.colour, createdAt);
    return { ...input, createdAt, archivedAt: null };
  }

  async archiveProject(id: string, at: number): Promise<void> {
    this.statements.archiveProject.run(at, id);
  }

  async saveSession(session: WorkSession): Promise<void> {
    this.statements.insertSession.run(
      session.id,
      session.projectId,
      session.startedAt,
      session.endedAt,
    );
  }

  async listSessions(query: SessionQuery = {}): Promise<readonly WorkSession[]> {
    const where: string[] = [];
    const params: (string | number)[] = [];

    if (query.projectId !== undefined) {
      where.push('project_id = ?');
      params.push(query.projectId);
    }
    if (query.since !== undefined) {
      where.push('started_at >= ?');
      params.push(query.since);
    }
    if (query.until !== undefined) {
      where.push('started_at < ?');
      params.push(query.until);
    }

    let sql = 'SELECT * FROM sessions';
    if (where.length > 0) sql += ` WHERE ${where.join(' AND ')}`;
    sql += ' ORDER BY started_at DESC';
    if (query.limit !== undefined) {
      sql += ' LIMIT ?';
      params.push(query.limit);
    }

    return asRows<SessionRow>(this.db.prepare(sql).all(...params)).map(toSession);
  }

  async deleteSession(id: SessionId): Promise<void> {
    this.statements.deleteSession.run(id);
  }

  async listTasks(): Promise<readonly Task[]> {
    return asRows<TaskRow>(this.statements.listTasks.all()).map(toTask);
  }

  async saveTask(task: Task): Promise<void> {
    this.statements.upsertTask.run(
      task.id,
      task.title,
      task.projectId,
      task.dueOn,
      task.doneAt,
      task.createdAt,
      task.priority,
    );
  }

  async deleteTask(id: string): Promise<void> {
    this.statements.deleteTask.run(id);
  }

  async getRunningSession(): Promise<WorkSession | null> {
    const row = this.statements.getState.get(RUNNING_SESSION_KEY) as { value: string } | undefined;
    if (row === undefined) return null;
    try {
      return JSON.parse(row.value) as WorkSession;
    } catch {
      // Corrupt row should not stop the app from starting.
      return null;
    }
  }

  async setRunningSession(session: WorkSession | null): Promise<void> {
    if (session === null) {
      this.statements.clearState.run(RUNNING_SESSION_KEY);
      return;
    }
    this.statements.setState.run(RUNNING_SESSION_KEY, JSON.stringify(session));
  }

  async close(): Promise<void> {
    this.db.close();
  }
}
