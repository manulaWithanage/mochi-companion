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
  {
    version: 3,
    name: 'gmail-local-inbox',
    up: `
      CREATE TABLE email_cache (
        account           TEXT    NOT NULL,
        email_id          TEXT    NOT NULL,
        thread_id         TEXT    NOT NULL,
        uid               INTEGER NOT NULL,
        message_id        TEXT    NOT NULL,
        from_name         TEXT    NOT NULL,
        from_address      TEXT    NOT NULL,
        reply_to_address  TEXT    NOT NULL,
        to_addresses_json TEXT    NOT NULL,
        cc_addresses_json TEXT    NOT NULL,
        subject           TEXT    NOT NULL,
        received_at       INTEGER NOT NULL,
        category          TEXT    NOT NULL,
        labels_json       TEXT    NOT NULL,
        snippet           TEXT    NOT NULL,
        unread            INTEGER NOT NULL CHECK (unread IN (0, 1)),
        in_inbox          INTEGER NOT NULL CHECK (in_inbox IN (0, 1)),
        synced_at         INTEGER NOT NULL,
        PRIMARY KEY (account, email_id)
      );

      CREATE INDEX idx_email_cache_inbox
        ON email_cache (account, in_inbox, unread, received_at DESC);
      CREATE INDEX idx_email_cache_thread
        ON email_cache (account, thread_id, received_at DESC);

      CREATE TABLE email_ai_state (
        account             TEXT    NOT NULL,
        email_id            TEXT    NOT NULL,
        priority_score      REAL,
        priority_tier       TEXT,
        priority_confidence REAL,
        priority_source     TEXT,
        signals_json        TEXT,
        reason              TEXT,
        reply_likely        INTEGER,
        scorer_version      INTEGER,
        classified_at       INTEGER,
        draft_status        TEXT    NOT NULL DEFAULT 'none',
        draft_subject       TEXT,
        draft_body          TEXT,
        draft_error         TEXT,
        PRIMARY KEY (account, email_id),
        FOREIGN KEY (account, email_id)
          REFERENCES email_cache (account, email_id) ON DELETE CASCADE
      );

      CREATE TABLE email_reminders (
        account           TEXT    NOT NULL,
        email_id          TEXT    NOT NULL,
        thread_id         TEXT    NOT NULL,
        state             TEXT    NOT NULL,
        next_reminder_at  INTEGER,
        last_reminded_at  INTEGER,
        reminder_count    INTEGER NOT NULL DEFAULT 0,
        snoozed_until     INTEGER,
        dismissed_at      INTEGER,
        replied_at        INTEGER,
        PRIMARY KEY (account, email_id),
        FOREIGN KEY (account, email_id)
          REFERENCES email_cache (account, email_id) ON DELETE CASCADE
      );

      CREATE INDEX idx_email_reminders_pending
        ON email_reminders (account, state, next_reminder_at);

      CREATE TABLE gmail_sync_state (
        account         TEXT PRIMARY KEY,
        uid_validity    TEXT,
        last_synced_at  INTEGER NOT NULL,
        last_error      TEXT
      );
    `,
  },
  {
    version: 4,
    name: 'activity-spans',
    up: `
      CREATE TABLE activity_spans (
        id          TEXT    PRIMARY KEY,
        app         TEXT    NOT NULL,
        category    TEXT    NOT NULL,
        started_at  INTEGER NOT NULL,
        ended_at    INTEGER NOT NULL
      );

      -- Every read is "spans overlapping a window", so the range is the index.
      CREATE INDEX idx_activity_range ON activity_spans (started_at, ended_at);
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
