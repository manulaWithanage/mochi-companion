/**
 * SQLite schema and migrations for the local Mochi database.
 *
 * Pure data — SQL strings and version numbers. No driver import lives here;
 * apps/desktop opens the database with better-sqlite3 and applies these.
 */

export interface Migration {
  /** Applied in ascending order; matched against PRAGMA user_version. */
  readonly version: number;
  readonly name: string;
  readonly up: string;
}

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'initial-time-tracking',
    up: `
      CREATE TABLE projects (
        id          TEXT    PRIMARY KEY,
        name        TEXT    NOT NULL,
        colour      TEXT    NOT NULL,
        created_at  INTEGER NOT NULL,
        archived_at INTEGER
      );

      CREATE TABLE sessions (
        id         TEXT    PRIMARY KEY,
        project_id TEXT    NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        started_at INTEGER NOT NULL,
        ended_at   INTEGER,
        CHECK (ended_at IS NULL OR ended_at >= started_at)
      );

      CREATE INDEX idx_sessions_started_at ON sessions (started_at DESC);
      CREATE INDEX idx_sessions_project    ON sessions (project_id, started_at DESC);

      -- Single-row-per-key store. Holds the running session so an unclean
      -- shutdown does not silently lose tracked time.
      CREATE TABLE app_state (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `,
  },
  {
    version: 2,
    name: 'tasks',
    up: `
      CREATE TABLE tasks (
        id           TEXT    PRIMARY KEY,
        title        TEXT    NOT NULL,
        project_id   TEXT    REFERENCES projects(id) ON DELETE SET NULL,
        -- Local YYYY-MM-DD. Null means "someday", not "today".
        due_on       TEXT,
        done_at      INTEGER,
        created_at   INTEGER NOT NULL,
        -- Higher sorts first within a day.
        priority     INTEGER NOT NULL DEFAULT 0
      );

      CREATE INDEX idx_tasks_due    ON tasks (due_on, done_at);
      CREATE INDEX idx_tasks_open   ON tasks (done_at, created_at DESC);
    `,
  },
];

export const LATEST_VERSION: number = MIGRATIONS.reduce(
  (max, m) => (m.version > max ? m.version : max),
  0,
);

/** Key used in `app_state` for the in-flight session. */
export const RUNNING_SESSION_KEY = 'running_session';

/**
 * PRAGMAs applied on every connection.
 *
 * WAL matters here: the overlay writes on every timer toggle while the
 * settings window may read at the same time, and WAL avoids the writer
 * blocking the reader.
 */
export const CONNECTION_PRAGMAS: readonly string[] = [
  'PRAGMA journal_mode = WAL',
  'PRAGMA synchronous = NORMAL',
  'PRAGMA foreign_keys = ON',
  'PRAGMA busy_timeout = 5000',
];

/** Migrations still to apply for a database at `currentVersion`. */
export function pendingMigrations(currentVersion: number): readonly Migration[] {
  return MIGRATIONS.filter((m) => m.version > currentVersion).sort((a, b) => a.version - b.version);
}

export const DEFAULT_PROJECT = {
  id: 'default',
  name: 'General',
  colour: '#F2A6B3',
} as const;
