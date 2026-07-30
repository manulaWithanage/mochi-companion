/**
 * Owns the calendar feed: fetch, parse, cache, refresh.
 *
 * The cache is the read path. Every consumer — the Today tab, the briefing,
 * meeting alerts — reads from memory; the network is touched on a timer, never
 * on a query. A speech bubble must not wait on someone else's server.
 *
 * Failures degrade rather than erase. A feed that times out leaves the last
 * good events in place and reports the problem through status, because an
 * empty calendar and an unreachable calendar look identical to a user but mean
 * very different things.
 */

import {
  parseIcs,
  looksLikeIcsUrl,
  normaliseIcsUrl,
  redactIcsUrl,
} from './ics.js';
import type { CalendarConnectResult, CalendarEvent, CalendarStatus } from '@mochi/core';

/**
 * What the service needs from storage.
 *
 * An interface rather than the concrete CalendarVault so this module has no
 * runtime import of electron, which is what lets the fetch logic — 304s, size
 * caps, degrading on failure — be tested at all. CalendarVault satisfies it
 * structurally; index.ts supplies the real one.
 */
export interface CalendarFeedStore {
  readonly available: boolean;
  readonly hasFeed: boolean;
  readonly redacted: string;
  readonly selfEmail: string | null;
  store(rawUrl: string, selfEmail?: string): boolean;
  reveal(): string | null;
  clear(): void;
}

/** Injectable so tests do not need a network. */
export type FetchLike = typeof fetch;

/** Nobody waits forever on a calendar server. */
const FETCH_TIMEOUT_MS = 15_000;

/**
 * Refuse absurd feeds.
 *
 * A shared calendar with years of history can be tens of megabytes, and the
 * whole thing is parsed into memory. This is a ceiling on someone else's file.
 */
const MAX_FEED_BYTES = 8 * 1024 * 1024;

/**
 * How often to re-fetch.
 *
 * Deliberately unhurried. Google caches its own secret iCal address, so polling
 * faster does not produce fresher data — it just spends requests. If the
 * measured staleness turns out to be low this can come down; if it is hours,
 * this feed drives the briefing and live meeting alerts need the API instead.
 */
export const CALENDAR_REFRESH_MS = 15 * 60_000;

/** Rolling window kept in memory. */
const WINDOW_BACK_MS = 24 * 60 * 60_000;
const WINDOW_FORWARD_MS = 21 * 24 * 60 * 60_000;

export type CalendarListener = (status: CalendarStatus) => void;

export class CalendarService {
  private events: readonly CalendarEvent[] = [];
  private lastSyncAt: number | null = null;
  private lastError: string | undefined;
  private syncing = false;
  private timer: NodeJS.Timeout | null = null;
  private readonly listeners = new Set<CalendarListener>();
  /** Set by the server; lets an unchanged feed answer 304 instead of resending. */
  private etag: string | null = null;

  constructor(
    private readonly vault: CalendarFeedStore,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  /** Begin periodic refresh. Safe to call when no feed is configured. */
  start(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => void this.refresh(), CALENDAR_REFRESH_MS);
    if (this.vault.hasFeed) void this.refresh();
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * Validate a pasted URL by actually fetching it, then store it.
   *
   * Storing only after a successful fetch means a typo is caught while the user
   * can still see what they typed, rather than as an empty calendar hours later.
   */
  async connect(rawUrl: string, selfEmail?: string): Promise<CalendarConnectResult> {
    if (!looksLikeIcsUrl(rawUrl)) {
      return {
        ok: false,
        error: 'That does not look like a calendar address. It should start with https and end in .ics',
      };
    }
    if (!this.vault.available) {
      return { ok: false, error: 'This system cannot encrypt secrets, so the address was not saved.' };
    }

    const url = normaliseIcsUrl(rawUrl);
    const result = await this.fetchFeed(url);
    if (!result.ok) return { ok: false, error: result.error };

    const parsed = parseIcs(result.text, {
      ...this.window(),
      ...(selfEmail !== undefined ? { selfEmail } : {}),
    });

    if (!this.vault.store(url, selfEmail)) {
      return { ok: false, error: 'Could not save the calendar address securely.' };
    }

    this.events = parsed;
    this.lastSyncAt = Date.now();
    this.lastError = undefined;
    this.etag = result.etag;
    this.emit();

    console.log(`[calendar] connected to ${redactIcsUrl(url)} — ${parsed.length} event(s)`);
    return { ok: true, eventCount: parsed.length };
  }

  disconnect(): CalendarStatus {
    this.vault.clear();
    this.events = [];
    this.lastSyncAt = null;
    this.lastError = undefined;
    this.etag = null;
    return this.emit();
  }

  /** Re-fetch now. Never throws. */
  async refresh(): Promise<CalendarStatus> {
    const url = this.vault.reveal();
    if (url === null) return this.status();
    // Overlapping fetches would race to set the cache; the slower one could
    // land last and overwrite fresher data with staler.
    if (this.syncing) return this.status();

    this.syncing = true;
    this.emit();

    try {
      const result = await this.fetchFeed(url, this.etag);

      if (!result.ok) {
        // Keep the events we have. An unreachable calendar is not an empty one.
        this.lastError = result.error;
        return this.status();
      }

      this.etag = result.etag;

      if (result.notModified) {
        // Nothing changed, but the check succeeded, so the data is current.
        this.lastSyncAt = Date.now();
        this.lastError = undefined;
        return this.status();
      }

      const selfEmail = this.vault.selfEmail;
      this.events = parseIcs(result.text, {
        ...this.window(),
        ...(selfEmail !== null ? { selfEmail } : {}),
      });
      this.lastSyncAt = Date.now();
      this.lastError = undefined;
    } finally {
      this.syncing = false;
      this.emit();
    }

    return this.status();
  }

  /** Everything currently known. Read from memory; never hits the network. */
  get cached(): readonly CalendarEvent[] {
    return this.events;
  }

  status(): CalendarStatus {
    return {
      connected: this.vault.hasFeed,
      redacted: this.vault.redacted,
      lastSyncAt: this.lastSyncAt,
      ...(this.lastError !== undefined ? { error: this.lastError } : {}),
      eventCount: this.events.length,
      syncing: this.syncing,
    };
  }

  onChange(listener: CalendarListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    this.stop();
    this.listeners.clear();
  }

  private window(): { from: number; to: number } {
    const now = Date.now();
    return { from: now - WINDOW_BACK_MS, to: now + WINDOW_FORWARD_MS };
  }

  private emit(): CalendarStatus {
    const status = this.status();
    for (const listener of this.listeners) listener(status);
    return status;
  }

  /**
   * Fetch the feed.
   *
   * Never throws, and never puts the URL in an error message — the token in it
   * would end up in a log or on screen.
   */
  private async fetchFeed(
    url: string,
    etag: string | null = null,
  ): Promise<
    | { ok: true; text: string; etag: string | null; notModified?: boolean }
    | { ok: false; error: string }
  > {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await this.fetchImpl(url, {
        signal: controller.signal,
        headers: {
          Accept: 'text/calendar, text/plain;q=0.9, */*;q=0.5',
          ...(etag !== null ? { 'If-None-Match': etag } : {}),
        },
      });

      if (response.status === 304) {
        return { ok: true, text: '', etag, notModified: true };
      }

      if (!response.ok) {
        return { ok: false, error: this.describeStatus(response.status) };
      }

      // Trust the header when present, but check the body too: a server can
      // omit content-length, and the point is not to hold a 200MB string.
      const declared = Number(response.headers.get('content-length') ?? '0');
      if (Number.isFinite(declared) && declared > MAX_FEED_BYTES) {
        return { ok: false, error: 'That calendar is too large to load.' };
      }

      const text = await response.text();
      if (text.length > MAX_FEED_BYTES) {
        return { ok: false, error: 'That calendar is too large to load.' };
      }

      // A wrong URL usually returns an HTML error page with a 200, which would
      // otherwise parse to zero events and look like an empty calendar.
      if (!text.includes('BEGIN:VCALENDAR')) {
        return {
          ok: false,
          error: 'That address did not return a calendar. Check you copied the iCal link.',
        };
      }

      return { ok: true, text, etag: response.headers.get('etag') };
    } catch (error) {
      if (controller.signal.aborted) {
        return { ok: false, error: 'The calendar server did not respond in time.' };
      }
      const message = error instanceof Error ? error.message : String(error);
      // The message can contain the URL, so it is described rather than quoted.
      return {
        ok: false,
        error: /ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(message)
          ? 'Could not reach the calendar server. Check your connection.'
          : 'Could not load the calendar.',
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private describeStatus(status: number): string {
    switch (status) {
      case 401:
      case 403:
        return 'That calendar address was rejected. Secret addresses expire if you reset them in Google Calendar.';
      case 404:
        return 'No calendar at that address. It may have been reset, which invalidates the old link.';
      case 429:
        return 'The calendar server is rate-limiting us. It will retry shortly.';
      default:
        return `The calendar server returned ${status}.`;
    }
  }
}
