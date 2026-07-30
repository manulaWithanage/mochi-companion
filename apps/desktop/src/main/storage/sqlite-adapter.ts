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

import { createRequire } from 'node:module';
import type { DatabaseSync as DatabaseSyncType, StatementSync } from 'node:sqlite';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { ACTIVITY_CATEGORIES, activitySpanId } from '@mochi/core';
import type {
  ActivityCategory,
  ActivitySpan,
  CachedEmail,
  CachedEmailQuery,
  CachedInboxItem,
  EmailCategory,
  EmailReminderState,
  EmailStore,
  GmailSyncState,
  Project,
  SessionQuery,
  SessionId,
  StorageAdapter,
  StoredEmailDraft,
  StoredEmailPriority,
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
import type { SensitiveValueCodec } from './sensitive-value-codec.js';

// Vite 5 predates node:sqlite and tries to resolve it as an npm package.
// Loading the runtime built-in through createRequire keeps both the Electron
// bundle and plain-Node integration tests on the same native implementation.
const { DatabaseSync } = createRequire(import.meta.url)(
  'node:sqlite',
) as typeof import('node:sqlite');

interface ProjectRow {
  id: string;
  name: string;
  colour: string;
  created_at: number;
  archived_at: number | null;
}

interface ActivityRow {
  id: string;
  app: string;
  category: string;
  started_at: number;
  ended_at: number;
}

/** Narrow a stored category; an unknown one falls back rather than breaking totals. */
const isActivityCategory = (value: string): value is ActivityCategory =>
  ACTIVITY_CATEGORIES.some((c) => c.id === value);

interface TaskRow {
  id: string;
  title: string;
  project_id: string | null;
  due_on: string | null;
  done_at: number | null;
  created_at: number;
  priority: number;
  remind_at: number | null;
}

interface SessionRow {
  id: string;
  project_id: string;
  started_at: number;
  ended_at: number | null;
}

interface EmailRow {
  account: string;
  email_id: string;
  thread_id: string;
  uid: number;
  message_id: string;
  from_name: string;
  from_address: string;
  reply_to_address: string;
  to_addresses_json: string;
  cc_addresses_json: string;
  subject: string;
  received_at: number;
  category: string;
  labels_json: string;
  snippet: string;
  unread: number;
  in_inbox: number;
  synced_at: number;
  priority_score: number | null;
  priority_tier: string | null;
  priority_confidence: number | null;
  priority_source: string | null;
  signals_json: string | null;
  reason: string | null;
  reply_likely: number | null;
  scorer_version: number | null;
  classified_at: number | null;
  draft_status: string | null;
  draft_subject: string | null;
  draft_body: string | null;
  draft_error: string | null;
  reminder_state: string | null;
  next_reminder_at: number | null;
  last_reminded_at: number | null;
  reminder_count: number | null;
  snoozed_until: number | null;
  dismissed_at: number | null;
  replied_at: number | null;
}

interface ReminderRow {
  account: string;
  email_id: string;
  thread_id: string;
  state: string;
  next_reminder_at: number | null;
  last_reminded_at: number | null;
  reminder_count: number;
  snoozed_until: number | null;
  dismissed_at: number | null;
  replied_at: number | null;
}

interface SyncStateRow {
  account: string;
  uid_validity: string | null;
  last_synced_at: number;
  last_error: string | null;
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
  // Rows written before migration 5 have no column value at all.
  remindAt: row.remind_at ?? null,
});

const toSession = (row: SessionRow): WorkSession => ({
  id: row.id,
  projectId: row.project_id,
  startedAt: row.started_at,
  endedAt: row.ended_at,
});

function stringArray(raw: string | null): readonly string[] {
  if (raw === null) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === 'string')
      : [];
  } catch {
    return [];
  }
}

const toReminder = (
  row: ReminderRow,
  codec: SensitiveValueCodec,
  account = row.account,
): EmailReminderState => ({
  account,
  emailId: row.email_id,
  threadId: codec.reveal(row.thread_id),
  state:
    row.state === 'not-required' ||
    row.state === 'draft-ready' ||
    row.state === 'replied' ||
    row.state === 'dismissed'
      ? row.state
      : 'pending',
  nextReminderAt: row.next_reminder_at,
  lastRemindedAt: row.last_reminded_at,
  reminderCount: row.reminder_count,
  snoozedUntil: row.snoozed_until,
  dismissedAt: row.dismissed_at,
  repliedAt: row.replied_at,
});

const toInboxItem = (
  row: EmailRow,
  codec: SensitiveValueCodec,
  account = row.account,
): CachedInboxItem => {
  const email: CachedEmail = {
    account,
    emailId: row.email_id,
    threadId: codec.reveal(row.thread_id),
    uid: row.uid,
    messageId: codec.reveal(row.message_id),
    fromName: codec.reveal(row.from_name),
    fromAddress: codec.reveal(row.from_address),
    replyToAddress: codec.reveal(row.reply_to_address),
    toAddresses: stringArray(codec.reveal(row.to_addresses_json)),
    ccAddresses: stringArray(codec.reveal(row.cc_addresses_json)),
    subject: codec.reveal(row.subject),
    receivedAt: row.received_at,
    category: row.category as EmailCategory,
    labels: stringArray(codec.reveal(row.labels_json)),
    snippet: codec.reveal(row.snippet),
    unread: row.unread === 1,
    inInbox: row.in_inbox === 1,
    syncedAt: row.synced_at,
  };

  const priority: StoredEmailPriority | null =
    row.priority_score === null ||
    row.priority_tier === null ||
    row.priority_confidence === null ||
    row.priority_source === null ||
    row.reason === null ||
    row.reply_likely === null ||
    row.scorer_version === null ||
    row.classified_at === null
      ? null
      : {
          account,
          emailId: row.email_id,
          score: row.priority_score,
          tier:
            row.priority_tier === 'urgent' || row.priority_tier === 'review'
              ? row.priority_tier
              : 'low',
          confidence: row.priority_confidence,
          source:
            row.priority_source === 'llm' || row.priority_source === 'blended'
              ? row.priority_source
              : 'rules',
          signals: stringArray(row.signals_json === null ? null : codec.reveal(row.signals_json)),
          reason: codec.reveal(row.reason),
          replyLikely: row.reply_likely === 1,
          scorerVersion: row.scorer_version,
          classifiedAt: row.classified_at,
        };

  const draft: StoredEmailDraft | null =
    row.draft_status === null
      ? null
      : {
          account,
          emailId: row.email_id,
          status:
            row.draft_status === 'queued' ||
            row.draft_status === 'generating' ||
            row.draft_status === 'ready' ||
            row.draft_status === 'failed'
              ? row.draft_status
              : 'none',
          subject: row.draft_subject === null ? null : codec.reveal(row.draft_subject),
          body: row.draft_body === null ? null : codec.reveal(row.draft_body),
          error: row.draft_error === null ? null : codec.reveal(row.draft_error),
        };

  const reminder: EmailReminderState | null =
    row.reminder_state === null
      ? null
      : toReminder(
          {
            account,
            email_id: row.email_id,
            thread_id: row.thread_id,
            state: row.reminder_state,
            next_reminder_at: row.next_reminder_at,
            last_reminded_at: row.last_reminded_at,
            reminder_count: row.reminder_count ?? 0,
            snoozed_until: row.snoozed_until,
            dismissed_at: row.dismissed_at,
            replied_at: row.replied_at,
          },
          codec,
          account,
        );

  return { ...email, priority, draft, reminder };
};

const EMAIL_SELECT = `
  SELECT
    e.*,
    a.priority_score,
    a.priority_tier,
    a.priority_confidence,
    a.priority_source,
    a.signals_json,
    a.reason,
    a.reply_likely,
    a.scorer_version,
    a.classified_at,
    a.draft_status,
    a.draft_subject,
    a.draft_body,
    a.draft_error,
    r.state AS reminder_state,
    r.next_reminder_at,
    r.last_reminded_at,
    r.reminder_count,
    r.snoozed_until,
    r.dismissed_at,
    r.replied_at
  FROM email_cache e
  LEFT JOIN email_ai_state a
    ON a.account = e.account AND a.email_id = e.email_id
  LEFT JOIN email_reminders r
    ON r.account = e.account AND r.email_id = e.email_id
`;

export class SqliteStorageAdapter implements StorageAdapter, EmailStore {
  private readonly db: DatabaseSyncType;
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
    insertActivity: StatementSync;
    listActivity: StatementSync;
    pruneActivity: StatementSync;
    deleteTask: StatementSync;
    upsertEmail: StatementSync;
    markInboxStale: StatementSync;
    getEmail: StatementSync;
    upsertEmailPriority: StatementSync;
    upsertEmailDraft: StatementSync;
    upsertEmailReminder: StatementSync;
    listPendingEmailReminders: StatementSync;
    getGmailSyncState: StatementSync;
    upsertGmailSyncState: StatementSync;
    deleteEmailData: StatementSync;
    deleteGmailSyncState: StatementSync;
    deleteExpiredEmailData: StatementSync;
  };

  constructor(
    filePath: string,
    private readonly codec: SensitiveValueCodec,
  ) {
    mkdirSync(dirname(filePath), { recursive: true });
    this.db = new DatabaseSync(filePath);

    for (const pragma of CONNECTION_PRAGMAS) {
      this.db.exec(pragma);
    }
    this.migrate();
    this.protectLegacyEmailData();
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
      insertActivity: this.db.prepare(
        `INSERT INTO activity_spans (id, app, category, started_at, ended_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           ended_at = excluded.ended_at,
           category = excluded.category`,
      ),
      listActivity: this.db.prepare(
        `SELECT * FROM activity_spans
          WHERE ended_at > ? AND started_at < ?
          ORDER BY started_at ASC`,
      ),
      pruneActivity: this.db.prepare(`DELETE FROM activity_spans WHERE ended_at < ?`),
      upsertTask: this.db.prepare(
        `INSERT INTO tasks (id, title, project_id, due_on, done_at, created_at, priority, remind_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           title      = excluded.title,
           project_id = excluded.project_id,
           due_on     = excluded.due_on,
           done_at    = excluded.done_at,
           priority   = excluded.priority,
           remind_at  = excluded.remind_at`,
      ),
      deleteTask: this.db.prepare(`DELETE FROM tasks WHERE id = ?`),
      upsertEmail: this.db.prepare(
        `INSERT INTO email_cache (
           account, email_id, thread_id, uid, message_id, from_name,
           from_address, reply_to_address, to_addresses_json, cc_addresses_json,
           subject, received_at, category, labels_json, snippet, unread,
           in_inbox, synced_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(account, email_id) DO UPDATE SET
           thread_id         = excluded.thread_id,
           uid               = excluded.uid,
           message_id        = excluded.message_id,
           from_name         = excluded.from_name,
           from_address      = excluded.from_address,
           reply_to_address  = excluded.reply_to_address,
           to_addresses_json = excluded.to_addresses_json,
           cc_addresses_json = excluded.cc_addresses_json,
           subject           = excluded.subject,
           received_at       = excluded.received_at,
           category          = excluded.category,
           labels_json       = excluded.labels_json,
           snippet           = excluded.snippet,
           unread            = excluded.unread,
           in_inbox          = excluded.in_inbox,
           synced_at         = excluded.synced_at`,
      ),
      markInboxStale: this.db.prepare(
        `UPDATE email_cache
         SET unread = 0, in_inbox = 0, synced_at = ?
         WHERE account = ? AND in_inbox = 1`,
      ),
      getEmail: this.db.prepare(`${EMAIL_SELECT} WHERE e.account = ? AND e.email_id = ?`),
      upsertEmailPriority: this.db.prepare(
        `INSERT INTO email_ai_state (
           account, email_id, priority_score, priority_tier,
           priority_confidence, priority_source, signals_json, reason,
           reply_likely, scorer_version, classified_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(account, email_id) DO UPDATE SET
           priority_score      = excluded.priority_score,
           priority_tier       = excluded.priority_tier,
           priority_confidence = excluded.priority_confidence,
           priority_source     = excluded.priority_source,
           signals_json        = excluded.signals_json,
           reason              = excluded.reason,
           reply_likely        = excluded.reply_likely,
           scorer_version      = excluded.scorer_version,
           classified_at       = excluded.classified_at`,
      ),
      upsertEmailDraft: this.db.prepare(
        `INSERT INTO email_ai_state (
           account, email_id, draft_status, draft_subject, draft_body, draft_error
         ) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(account, email_id) DO UPDATE SET
           draft_status  = excluded.draft_status,
           draft_subject = excluded.draft_subject,
           draft_body    = excluded.draft_body,
           draft_error   = excluded.draft_error`,
      ),
      upsertEmailReminder: this.db.prepare(
        `INSERT INTO email_reminders (
           account, email_id, thread_id, state, next_reminder_at,
           last_reminded_at, reminder_count, snoozed_until,
           dismissed_at, replied_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(account, email_id) DO UPDATE SET
           thread_id        = excluded.thread_id,
           state            = excluded.state,
           next_reminder_at = excluded.next_reminder_at,
           last_reminded_at = excluded.last_reminded_at,
           reminder_count   = excluded.reminder_count,
           snoozed_until    = excluded.snoozed_until,
           dismissed_at     = excluded.dismissed_at,
           replied_at       = excluded.replied_at`,
      ),
      listPendingEmailReminders: this.db.prepare(
        `SELECT * FROM email_reminders
         WHERE account = ? AND state IN ('pending', 'draft-ready')
         ORDER BY next_reminder_at ASC`,
      ),
      getGmailSyncState: this.db.prepare(`SELECT * FROM gmail_sync_state WHERE account = ?`),
      upsertGmailSyncState: this.db.prepare(
        `INSERT INTO gmail_sync_state (account, uid_validity, last_synced_at, last_error)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(account) DO UPDATE SET
           uid_validity   = excluded.uid_validity,
           last_synced_at = excluded.last_synced_at,
           last_error     = excluded.last_error`,
      ),
      deleteEmailData: this.db.prepare(`DELETE FROM email_cache WHERE account = ?`),
      deleteGmailSyncState: this.db.prepare(`DELETE FROM gmail_sync_state WHERE account = ?`),
      deleteExpiredEmailData: this.db.prepare(
        `DELETE FROM email_cache WHERE account = ? AND received_at < ?`,
      ),
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

  /**
   * One-time, idempotent migration for databases written before protected
   * fields were introduced. Structural identifiers and timestamps remain
   * queryable; message content, addresses, labels, model explanations and
   * generated drafts are sealed individually.
   */
  private protectLegacyEmailData(): void {
    const protect = (value: string | null): string | null =>
      value === null || this.codec.isProtected(value) ? value : this.codec.protect(value);
    const emailRows = asRows<EmailRow>(
      this.db
        .prepare(
          `SELECT e.*, NULL AS priority_score, NULL AS priority_tier,
             NULL AS priority_confidence, NULL AS priority_source,
             NULL AS signals_json, NULL AS reason, NULL AS reply_likely,
             NULL AS scorer_version, NULL AS classified_at,
             NULL AS draft_status, NULL AS draft_subject, NULL AS draft_body,
             NULL AS draft_error, NULL AS reminder_state,
             NULL AS next_reminder_at, NULL AS last_reminded_at,
             NULL AS reminder_count, NULL AS snoozed_until,
             NULL AS dismissed_at, NULL AS replied_at
           FROM email_cache e`,
        )
        .all(),
    );
    const aiRows = asRows<{
      account: string;
      email_id: string;
      signals_json: string | null;
      reason: string | null;
      draft_subject: string | null;
      draft_body: string | null;
      draft_error: string | null;
    }>(
      this.db
        .prepare(
          `SELECT account, email_id, signals_json, reason,
             draft_subject, draft_body, draft_error
           FROM email_ai_state`,
        )
        .all(),
    );
    const reminderRows = asRows<Pick<ReminderRow, 'account' | 'email_id' | 'thread_id'>>(
      this.db.prepare(`SELECT account, email_id, thread_id FROM email_reminders`).all(),
    );
    const syncRows = asRows<SyncStateRow>(this.db.prepare(`SELECT * FROM gmail_sync_state`).all());

    const needsMigration =
      emailRows.some((row) =>
        [
          row.thread_id,
          row.message_id,
          row.from_name,
          row.from_address,
          row.reply_to_address,
          row.to_addresses_json,
          row.cc_addresses_json,
          row.subject,
          row.labels_json,
          row.snippet,
        ].some((value) => !this.codec.isProtected(value)),
      ) ||
      aiRows.some((row) =>
        [row.signals_json, row.reason, row.draft_subject, row.draft_body, row.draft_error].some(
          (value) => value !== null && !this.codec.isProtected(value),
        ),
      ) ||
      reminderRows.some((row) => !this.codec.isProtected(row.thread_id)) ||
      syncRows.some(
        (row) =>
          (row.uid_validity !== null && !this.codec.isProtected(row.uid_validity)) ||
          (row.last_error !== null && !this.codec.isProtected(row.last_error)),
      );
    if (!needsMigration) return;

    const updateEmail = this.db.prepare(
      `UPDATE email_cache SET
         thread_id = ?, message_id = ?, from_name = ?, from_address = ?,
         reply_to_address = ?, to_addresses_json = ?, cc_addresses_json = ?,
         subject = ?, labels_json = ?, snippet = ?
       WHERE account = ? AND email_id = ?`,
    );
    const updateAi = this.db.prepare(
      `UPDATE email_ai_state SET signals_json = ?, reason = ?,
         draft_subject = ?, draft_body = ?, draft_error = ?
       WHERE account = ? AND email_id = ?`,
    );
    const updateReminder = this.db.prepare(
      `UPDATE email_reminders SET thread_id = ? WHERE account = ? AND email_id = ?`,
    );
    const updateSync = this.db.prepare(
      `UPDATE gmail_sync_state SET uid_validity = ?, last_error = ? WHERE account = ?`,
    );

    this.db.exec('BEGIN');
    try {
      for (const row of emailRows) {
        updateEmail.run(
          protect(row.thread_id),
          protect(row.message_id),
          protect(row.from_name),
          protect(row.from_address),
          protect(row.reply_to_address),
          protect(row.to_addresses_json),
          protect(row.cc_addresses_json),
          protect(row.subject),
          protect(row.labels_json),
          protect(row.snippet),
          row.account,
          row.email_id,
        );
      }
      for (const row of aiRows) {
        updateAi.run(
          protect(row.signals_json),
          protect(row.reason),
          protect(row.draft_subject),
          protect(row.draft_body),
          protect(row.draft_error),
          row.account,
          row.email_id,
        );
      }
      for (const row of reminderRows) {
        updateReminder.run(protect(row.thread_id), row.account, row.email_id);
      }
      for (const row of syncRows) {
        updateSync.run(protect(row.uid_validity), protect(row.last_error), row.account);
      }
      this.db.exec('COMMIT');
      console.log(`[storage] protected ${emailRows.length} legacy email records`);
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
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

  async saveActivitySpans(spans: readonly ActivitySpan[]): Promise<void> {
    // One transaction: a partial flush would leave the day's timeline with a
    // hole that looks exactly like time the user did not spend.
    this.db.exec('BEGIN');
    try {
      for (const span of spans) {
        this.statements.insertActivity.run(
          activitySpanId(span),
          span.app,
          span.category,
          span.startedAt,
          span.endedAt,
        );
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  async listActivitySpans(since: number, until: number): Promise<readonly ActivitySpan[]> {
    return asRows<ActivityRow>(this.statements.listActivity.all(since, until)).map((row) => ({
      app: row.app,
      // A category renamed in a later version would otherwise resurface as an
      // unknown string and break the totals.
      category: isActivityCategory(row.category) ? row.category : 'other',
      startedAt: row.started_at,
      endedAt: row.ended_at,
    }));
  }

  async pruneActivitySpans(before: number): Promise<void> {
    this.statements.pruneActivity.run(before);
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
      task.remindAt,
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

  async getAppState(key: string): Promise<string | null> {
    const row = this.statements.getState.get(key) as { value: string } | undefined;
    return row === undefined ? null : row.value;
  }

  async setAppState(key: string, value: string): Promise<void> {
    this.statements.setState.run(key, value);
  }

  async replaceInboxSnapshot(
    account: string,
    emails: readonly CachedEmail[],
    syncedAt: number,
  ): Promise<void> {
    this.db.exec('BEGIN');
    try {
      this.statements.markInboxStale.run(syncedAt, account);
      for (const email of emails) {
        this.statements.upsertEmail.run(
          account,
          email.emailId,
          this.codec.protect(email.threadId),
          email.uid,
          this.codec.protect(email.messageId),
          this.codec.protect(email.fromName),
          this.codec.protect(email.fromAddress),
          this.codec.protect(email.replyToAddress),
          this.codec.protect(JSON.stringify(email.toAddresses)),
          this.codec.protect(JSON.stringify(email.ccAddresses)),
          this.codec.protect(email.subject),
          email.receivedAt,
          email.category,
          this.codec.protect(JSON.stringify(email.labels)),
          this.codec.protect(email.snippet),
          email.unread ? 1 : 0,
          email.inInbox ? 1 : 0,
          syncedAt,
        );
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  async listCachedEmails(
    account: string,
    query: CachedEmailQuery = {},
  ): Promise<readonly CachedInboxItem[]> {
    const where = ['e.account = ?', 'e.in_inbox = 1', 'e.unread = 1'];
    const params: (string | number)[] = [account];
    if (query.category !== undefined) {
      where.push('e.category = ?');
      params.push(query.category);
    }

    const order =
      query.sort === 'priority'
        ? 'COALESCE(a.priority_score, 2) DESC, e.received_at DESC'
        : 'e.received_at DESC';
    const limit = Math.min(100, Math.max(1, query.limit ?? 25));
    const offset = Math.max(0, query.offset ?? 0);
    params.push(limit, offset);

    const sql = `${EMAIL_SELECT}
      WHERE ${where.join(' AND ')}
      ORDER BY ${order}
      LIMIT ? OFFSET ?`;
    return asRows<EmailRow>(this.db.prepare(sql).all(...params)).map((row) =>
      toInboxItem(row, this.codec, account),
    );
  }

  async getCachedEmail(account: string, emailId: string): Promise<CachedInboxItem | null> {
    const row = this.statements.getEmail.get(account, emailId) as EmailRow | undefined;
    return row === undefined ? null : toInboxItem(row, this.codec, account);
  }

  async saveEmailPriority(priority: StoredEmailPriority): Promise<void> {
    this.statements.upsertEmailPriority.run(
      priority.account,
      priority.emailId,
      priority.score,
      priority.tier,
      priority.confidence,
      priority.source,
      this.codec.protect(JSON.stringify(priority.signals)),
      this.codec.protect(priority.reason),
      priority.replyLikely ? 1 : 0,
      priority.scorerVersion,
      priority.classifiedAt,
    );
  }

  async saveEmailDraft(draft: StoredEmailDraft): Promise<void> {
    this.statements.upsertEmailDraft.run(
      draft.account,
      draft.emailId,
      draft.status,
      draft.subject === null ? null : this.codec.protect(draft.subject),
      draft.body === null ? null : this.codec.protect(draft.body),
      draft.error === null ? null : this.codec.protect(draft.error),
    );
  }

  async saveEmailReminder(reminder: EmailReminderState): Promise<void> {
    this.statements.upsertEmailReminder.run(
      reminder.account,
      reminder.emailId,
      this.codec.protect(reminder.threadId),
      reminder.state,
      reminder.nextReminderAt,
      reminder.lastRemindedAt,
      reminder.reminderCount,
      reminder.snoozedUntil,
      reminder.dismissedAt,
      reminder.repliedAt,
    );
  }

  async listPendingEmailReminders(account: string): Promise<readonly EmailReminderState[]> {
    return asRows<ReminderRow>(this.statements.listPendingEmailReminders.all(account)).map((row) =>
      toReminder(row, this.codec, account),
    );
  }

  async getGmailSyncState(account: string): Promise<GmailSyncState | null> {
    const row = this.statements.getGmailSyncState.get(account) as SyncStateRow | undefined;
    if (row === undefined) return null;
    return {
      account: row.account,
      uidValidity: row.uid_validity === null ? null : this.codec.reveal(row.uid_validity),
      lastSyncedAt: row.last_synced_at,
      lastError: row.last_error === null ? null : this.codec.reveal(row.last_error),
    };
  }

  async saveGmailSyncState(state: GmailSyncState): Promise<void> {
    this.statements.upsertGmailSyncState.run(
      state.account,
      state.uidValidity === null ? null : this.codec.protect(state.uidValidity),
      state.lastSyncedAt,
      state.lastError === null ? null : this.codec.protect(state.lastError),
    );
  }

  async deleteEmailData(account: string): Promise<number> {
    this.db.exec('BEGIN');
    try {
      const result = this.statements.deleteEmailData.run(account);
      this.statements.deleteGmailSyncState.run(account);
      this.db.exec('COMMIT');
      return Number(result.changes);
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  async deleteExpiredEmailData(account: string, receivedBefore: number): Promise<number> {
    const result = this.statements.deleteExpiredEmailData.run(account, receivedBefore);
    return Number(result.changes);
  }

  async close(): Promise<void> {
    this.db.close();
  }
}
