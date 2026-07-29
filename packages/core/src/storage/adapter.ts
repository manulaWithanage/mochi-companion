/**
 * Persistence contract.
 *
 * packages/core declares the interface; apps/desktop implements it with
 * better-sqlite3 (RULE 2). Nothing here imports a driver, so timer logic
 * stays testable against an in-memory fake.
 */

import type { SessionId, WorkSession } from '../timer/session.js';
import type { Task } from '../tasks/tasks.js';

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

export interface StorageAdapter {
  listProjects(): Promise<readonly Project[]>;
  createProject(input: Omit<Project, 'createdAt' | 'archivedAt'>): Promise<Project>;
  archiveProject(id: string, at: number): Promise<void>;

  /** Insert or update a completed session. */
  saveSession(session: WorkSession): Promise<void>;
  listSessions(query?: SessionQuery): Promise<readonly WorkSession[]>;
  deleteSession(id: SessionId): Promise<void>;

  listTasks(): Promise<readonly Task[]>;
  saveTask(task: Task): Promise<void>;
  deleteTask(id: string): Promise<void>;

  /**
   * The session currently running, persisted so an unclean shutdown does not
   * silently lose tracked time. Written on start, cleared on stop.
   */
  getRunningSession(): Promise<WorkSession | null>;
  setRunningSession(session: WorkSession | null): Promise<void>;

  close(): Promise<void>;
}

/**
 * Reference in-memory implementation. Used by tests and as the fallback if
 * the native SQLite module fails to load, so the app degrades to
 * this-session-only tracking rather than refusing to start.
 */
export class InMemoryStorageAdapter implements StorageAdapter {
  private projects = new Map<string, Project>();
  private sessions = new Map<SessionId, WorkSession>();
  private tasks = new Map<string, Task>();
  private running: WorkSession | null = null;

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

  async close(): Promise<void> {
    // Nothing to release.
  }
}
