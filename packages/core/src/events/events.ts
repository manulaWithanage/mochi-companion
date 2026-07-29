/**
 * Typed events and the in-process bus.
 *
 * The rule this exists to enforce: **sources emit events and never address
 * the mascot**. A calendar poller, a Gmail push relay, an IMAP fallback and a
 * Pomodoro timer all look identical from here, so adding one touches nothing
 * downstream — and the cloud relay in V1.5 becomes one more Source rather
 * than a rewrite.
 *
 * Nothing here decides whether the user gets interrupted. That is the
 * governor's job, and it is the only thing allowed to make that call.
 */

/** Higher wins when two events compete for the same moment. */
export type EventPriority = 'low' | 'normal' | 'high' | 'urgent';

export const PRIORITY_RANK: Record<EventPriority, number> = {
  low: 0,
  normal: 1,
  high: 2,
  urgent: 3,
};

export type EventSource = 'timer' | 'calendar' | 'mail' | 'tasks' | 'system' | 'routine';

export interface MochiEvent {
  /** Stable id, so a re-emitted event is recognised rather than duplicated. */
  readonly id: string;
  readonly source: EventSource;
  readonly kind: string;
  readonly priority: EventPriority;
  /** When the event became true (epoch ms). */
  readonly at: number;
  /**
   * Groups events describing the same underlying thing — one meeting, one
   * mail thread. Dismissing one dismisses the subject, not just the message,
   * so a re-poll cannot resurrect something the user waved away.
   */
  readonly subject: string;
  /** What Mochi would say. Templated in V1; LLM-phrased in V2. */
  readonly text: string;
  /**
   * True when the user asked for this directly — a click, a hotkey, launching
   * the app. These bypass the governor: refusing to answer something the user
   * just did is not restraint, it is a bug.
   */
  readonly userInitiated?: boolean;
  /** Past this point the event is stale and is dropped rather than deferred. */
  readonly expiresAt?: number;
}

export type EventListener = (event: MochiEvent) => void;

/**
 * Minimal synchronous bus. No async, no ordering surprises: a source emits,
 * every listener sees it in registration order, done.
 */
export class EventBus {
  private readonly listeners = new Set<EventListener>();

  emit(event: MochiEvent): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch (error) {
        // One bad listener must not stop the others from seeing the event.
        console.error('[bus] listener threw:', error);
      }
    }
  }

  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  get listenerCount(): number {
    return this.listeners.size;
  }
}

/** Convenience for building events without repeating the boilerplate. */
export function makeEvent(
  input: Omit<MochiEvent, 'id' | 'priority'> & Partial<Pick<MochiEvent, 'id' | 'priority'>>,
): MochiEvent {
  return {
    priority: 'normal',
    id: input.id ?? `${input.source}:${input.kind}:${input.at}`,
    ...input,
  };
}
