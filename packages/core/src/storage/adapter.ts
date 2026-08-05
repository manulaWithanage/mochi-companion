/**
 * Persistence contract.
 *
 * packages/core declares the interface; apps/desktop implements it with
 * better-sqlite3 (RULE 2). Nothing here imports a driver, so timer logic
 * stays testable against an in-memory fake.
 */

import type { SessionId, WorkSession } from '../timer/session.js';
import { activitySpanId, type ActivitySpan } from '../activity/activity.js';
import type { Task } from '../tasks/tasks.js';
import type {
  CachedEmail,
  CachedEmailQuery,
  CachedInboxItem,
  EmailReminderState,
  EmailStore,
  GmailSyncState,
  StoredEmailDraft,
  StoredEmailPriority,
} from '../google/email-state.js';

export interface Project {
  readonly id: string;
  readonly name: string;
  /** CSS colour used for the dashboard and tray. */
  readonly colour: string;
  readonly createdAt: number;
  readonly archivedAt: number | null;
}

export interface SessionQuery {
  readonly projectId?: string;
  /** Inclusive epoch-ms lower bound. */
  readonly since?: number;
  /** Exclusive epoch-ms upper bound. */
  readonly until?: number;
  readonly limit?: number;
}

export interface StorageAdapter extends EmailStore {
  listProjects(): Promise<readonly Project[]>;
  createProject(input: Omit<Project, 'createdAt' | 'archivedAt'>): Promise<Project>;
  archiveProject(id: string, at: number): Promise<void>;

  /** Insert or update a completed session. */
  saveSession(session: WorkSession): Promise<void>;
  listSessions(query?: SessionQuery): Promise<readonly WorkSession[]>;
  deleteSession(id: SessionId): Promise<void>;

  /**
   * Append activity spans.
   *
   * Idempotent on id, so re-flushing an unchanged buffer after a crash cannot
   * double-count time.
   */
  saveActivitySpans(spans: readonly ActivitySpan[]): Promise<void>;
  /** Spans overlapping a window, clipped by the caller if it needs exact edges. */
  listActivitySpans(since: number, until: number): Promise<readonly ActivitySpan[]>;
  /** Drop everything older than `before`, for the retention setting. */
  pruneActivitySpans(before: number): Promise<void>;

  listTasks(): Promise<readonly Task[]>;
  saveTask(task: Task): Promise<void>;
  deleteTask(id: string): Promise<void>;

  /**
   * The session currently running, persisted so an unclean shutdown does not
   * silently lose tracked time. Written on start, cleared on stop.
   */
  getRunningSession(): Promise<WorkSession | null>;
  setRunningSession(session: WorkSession | null): Promise<void>;

  /**
   * Small named values that must outlive the process but are not user settings.
   *
   * Bookkeeping, not preferences: how far a scheduler has got, for instance.
   * It lives here rather than in the settings file because the user never
   * chose it and should never have to see it.
   */
  getAppState(key: string): Promise<string | null>;
  setAppState(key: string, value: string): Promise<void>;

  close(): Promise<void>;
}

/**
 * Reference in-memory implementation. Used by tests and as the fallback if
 * SQLite fails to open, so the app degrades to this-session-only tracking
 * rather than refusing to start.
 */
export class InMemoryStorageAdapter implements StorageAdapter {
  private projects = new Map<string, Project>();
  private sessions = new Map<SessionId, WorkSession>();
  private tasks = new Map<string, Task>();
  private activity = new Map<string, ActivitySpan>();
  private emails = new Map<string, CachedEmail>();
  private emailPriorities = new Map<string, StoredEmailPriority>();
  private emailDrafts = new Map<string, StoredEmailDraft>();
  private emailReminders = new Map<string, EmailReminderState>();
  private gmailSyncStates = new Map<string, GmailSyncState>();
  private running: WorkSession | null = null;
  private appState = new Map<string, string>();

  private emailKey(account: string, emailId: string): string {
    return `${account}\u0000${emailId}`;
  }

  async listProjects(): Promise<readonly Project[]> {
    return [...this.projects.values()].filter((p) => p.archivedAt === null);
  }

  async createProject(input: Omit<Project, 'createdAt' | 'archivedAt'>): Promise<Project> {
    const project: Project = { ...input, createdAt: Date.now(), archivedAt: null };
    this.projects.set(project.id, project);
    return project;
  }

  async archiveProject(id: string, at: number): Promise<void> {
    const existing = this.projects.get(id);
    if (existing !== undefined) this.projects.set(id, { ...existing, archivedAt: at });
  }

  async saveSession(session: WorkSession): Promise<void> {
    this.sessions.set(session.id, session);
  }

  async listSessions(query: SessionQuery = {}): Promise<readonly WorkSession[]> {
    let rows = [...this.sessions.values()];
    if (query.projectId !== undefined) {
      rows = rows.filter((s) => s.projectId === query.projectId);
    }
    if (query.since !== undefined) {
      const since = query.since;
      rows = rows.filter((s) => s.startedAt >= since);
    }
    if (query.until !== undefined) {
      const until = query.until;
      rows = rows.filter((s) => s.startedAt < until);
    }
    rows.sort((a, b) => b.startedAt - a.startedAt);
    return query.limit !== undefined ? rows.slice(0, query.limit) : rows;
  }

  async deleteSession(id: SessionId): Promise<void> {
    this.sessions.delete(id);
  }

  async listTasks(): Promise<readonly Task[]> {
    return [...this.tasks.values()];
  }

  async saveActivitySpans(spans: readonly ActivitySpan[]): Promise<void> {
    for (const span of spans) this.activity.set(activitySpanId(span), span);
  }

  async listActivitySpans(since: number, until: number): Promise<readonly ActivitySpan[]> {
    return [...this.activity.values()]
      .filter((s) => s.endedAt > since && s.startedAt < until)
      .sort((a, b) => a.startedAt - b.startedAt);
  }

  async pruneActivitySpans(before: number): Promise<void> {
    for (const [id, span] of this.activity) {
      if (span.endedAt < before) this.activity.delete(id);
    }
  }

  async saveTask(task: Task): Promise<void> {
    this.tasks.set(task.id, task);
  }

  async deleteTask(id: string): Promise<void> {
    this.tasks.delete(id);
  }

  async getRunningSession(): Promise<WorkSession | null> {
    return this.running;
  }

  async setRunningSession(session: WorkSession | null): Promise<void> {
    this.running = session;
  }

  async getAppState(key: string): Promise<string | null> {
    return this.appState.get(key) ?? null;
  }

  async setAppState(key: string, value: string): Promise<void> {
    this.appState.set(key, value);
  }

  async replaceInboxSnapshot(
    account: string,
    emails: readonly CachedEmail[],
    syncedAt: number,
  ): Promise<void> {
    for (const [key, existing] of this.emails) {
      if (existing.account === account && existing.inInbox) {
        this.emails.set(key, {
          ...existing,
          unread: false,
          inInbox: false,
          syncedAt,
        });
      }
    }
    for (const email of emails) {
      this.emails.set(this.emailKey(account, email.emailId), {
        ...email,
        account,
        syncedAt,
      });
    }
  }

  async listCachedEmails(
    account: string,
    query: CachedEmailQuery = {},
  ): Promise<readonly CachedInboxItem[]> {
    const rows = [...this.emails.values()].filter(
      (email) =>
        email.account === account &&
        email.inInbox &&
        email.unread &&
        (query.category === undefined || email.category === query.category),
    );
    rows.sort((a, b) => {
      if (query.sort === 'priority') {
        const aScore = this.emailPriorities.get(this.emailKey(a.account, a.emailId))?.score ?? 2;
        const bScore = this.emailPriorities.get(this.emailKey(b.account, b.emailId))?.score ?? 2;
        if (aScore !== bScore) return bScore - aScore;
      }
      return b.receivedAt - a.receivedAt;
    });

    const offset = Math.max(0, query.offset ?? 0);
    const limit = Math.min(100, Math.max(1, query.limit ?? 25));
    return rows.slice(offset, offset + limit).map((email) => {
      const key = this.emailKey(email.account, email.emailId);
      return {
        ...email,
        priority: this.emailPriorities.get(key) ?? null,
        draft: this.emailDrafts.get(key) ?? null,
        reminder: this.emailReminders.get(key) ?? null,
      };
    });
  }

  async getCachedEmail(account: string, emailId: string): Promise<CachedInboxItem | null> {
    const key = this.emailKey(account, emailId);
    const email = this.emails.get(key);
    if (email === undefined) return null;
    return {
      ...email,
      priority: this.emailPriorities.get(key) ?? null,
      draft: this.emailDrafts.get(key) ?? null,
      reminder: this.emailReminders.get(key) ?? null,
    };
  }

  async saveEmailPriority(priority: StoredEmailPriority): Promise<void> {
    this.emailPriorities.set(this.emailKey(priority.account, priority.emailId), priority);
  }

  async saveEmailDraft(draft: StoredEmailDraft): Promise<void> {
    this.emailDrafts.set(this.emailKey(draft.account, draft.emailId), draft);
  }

  async saveEmailReminder(reminder: EmailReminderState): Promise<void> {
    this.emailReminders.set(this.emailKey(reminder.account, reminder.emailId), reminder);
  }

  async listPendingEmailReminders(account: string): Promise<readonly EmailReminderState[]> {
    return [...this.emailReminders.values()]
      .filter(
        (reminder) =>
          reminder.account === account &&
          (reminder.state === 'pending' || reminder.state === 'draft-ready'),
      )
      .sort((a, b) => (a.nextReminderAt ?? Infinity) - (b.nextReminderAt ?? Infinity));
  }

  async getGmailSyncState(account: string): Promise<GmailSyncState | null> {
    return this.gmailSyncStates.get(account) ?? null;
  }

  async saveGmailSyncState(state: GmailSyncState): Promise<void> {
    this.gmailSyncStates.set(state.account, state);
  }

  async deleteEmailData(account: string): Promise<number> {
    let deleted = 0;
    for (const [key, email] of this.emails) {
      if (email.account !== account) continue;
      this.emails.delete(key);
      this.emailPriorities.delete(key);
      this.emailDrafts.delete(key);
      this.emailReminders.delete(key);
      deleted += 1;
    }
    this.gmailSyncStates.delete(account);
    return deleted;
  }

  async deleteExpiredEmailData(account: string, receivedBefore: number): Promise<number> {
    let deleted = 0;
    for (const [key, email] of this.emails) {
      if (email.account !== account || email.receivedAt >= receivedBefore) continue;
      this.emails.delete(key);
      this.emailPriorities.delete(key);
      this.emailDrafts.delete(key);
      this.emailReminders.delete(key);
      deleted += 1;
    }
    return deleted;
  }

  async close(): Promise<void> {
    // Nothing to release.
  }
}
