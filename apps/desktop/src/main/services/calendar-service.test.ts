import { describe, expect, it } from 'vitest';
import { CalendarService, type CalendarFeedStore, type FetchLike } from './calendar-service.js';

/** In-memory stand-in for the encrypted vault. */
function fakeVault(initialUrl: string | null = null): CalendarFeedStore {
  let url = initialUrl;
  let email: string | null = null;
  return {
    available: true,
    get hasFeed() {
      return url !== null;
    },
    get redacted() {
      return url === null ? '' : 'calendar.example.com/…';
    },
    get selfEmail() {
      return email;
    },
    store(rawUrl, selfEmail) {
      url = rawUrl;
      email = selfEmail ?? null;
      return true;
    },
    reveal: () => url,
    clear() {
      url = null;
      email = null;
    },
  };
}

const FEED = 'https://calendar.example.com/private-token/basic.ics';

const icsWith = (summary: string): string =>
  [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//test//EN',
    'BEGIN:VEVENT',
    'UID:x',
    `SUMMARY:${summary}`,
    // Relative to now so it always lands inside the service's rolling window.
    `DTSTART:${stamp(2)}`,
    `DTEND:${stamp(3)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

/** UTC stamp `hours` from now, in ICS basic format. */
function stamp(hours: number): string {
  const d = new Date(Date.now() + hours * 3_600_000);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}00Z`;
}

/** 204/205/304 are null-body statuses; the Fetch spec forbids a body on them. */
const NULL_BODY_STATUS = new Set([204, 205, 304]);

const respond = (
  body: string,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response => {
  const status = init.status ?? 200;
  return new Response(NULL_BODY_STATUS.has(status) ? null : body, {
    status,
    headers: { 'content-type': 'text/calendar', ...init.headers },
  });
};

/** A fetch that records its calls. */
function spyFetch(handler: (url: string, init?: RequestInit) => Response): {
  fetch: FetchLike;
  calls: { url: string; init?: RequestInit }[];
} {
  const calls: { url: string; init?: RequestInit }[] = [];
  const impl = (async (input: unknown, init?: RequestInit) => {
    calls.push({ url: String(input), ...(init !== undefined ? { init } : {}) });
    return handler(String(input), init);
  }) as unknown as FetchLike;
  return { fetch: impl, calls };
}

describe('connect', () => {
  it('rejects a URL that is not a feed, without a network call', () => {
    const { fetch: impl, calls } = spyFetch(() => respond(icsWith('x')));
    const service = new CalendarService(fakeVault(), impl);
    return service.connect('my calendar').then((result) => {
      expect(result.ok).toBe(false);
      expect(calls).toHaveLength(0);
    });
  });

  it('rejects http, because the URL is a bearer credential', async () => {
    const service = new CalendarService(fakeVault(), spyFetch(() => respond('')).fetch);
    expect((await service.connect('http://example.com/f.ics')).ok).toBe(false);
  });

  it('stores only after a successful fetch', async () => {
    // A typo should fail while the user can still see what they typed, not as
    // an empty calendar hours later.
    const vault = fakeVault();
    const service = new CalendarService(vault, spyFetch(() => respond('', { status: 404 })).fetch);

    const result = await service.connect(FEED);
    expect(result.ok).toBe(false);
    expect(vault.hasFeed).toBe(false);
  });

  it('reports the event count so connecting confirms itself', async () => {
    const service = new CalendarService(
      fakeVault(),
      spyFetch(() => respond(icsWith('Design review'))).fetch,
    );
    const result = await service.connect(FEED);
    expect(result).toMatchObject({ ok: true, eventCount: 1 });
    expect(service.cached[0]?.title).toBe('Design review');
  });

  it('rejects an HTML error page served with a 200', async () => {
    // A wrong URL usually returns a login or error page, which would otherwise
    // parse to zero events and be indistinguishable from an empty calendar.
    const service = new CalendarService(
      fakeVault(),
      spyFetch(() => respond('<html><body>Not found</body></html>')).fetch,
    );
    const result = await service.connect(FEED);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/did not return a calendar/i);
  });

  it('never puts the feed URL in an error message', async () => {
    // The token in it grants read access to the whole calendar.
    const service = new CalendarService(
      fakeVault(),
      spyFetch(() => respond('', { status: 500 })).fetch,
    );
    const result = await service.connect(FEED);
    expect(result.error ?? '').not.toContain('private-token');
  });

  it('explains a rejected address in terms of what the user can do', async () => {
    const service = new CalendarService(
      fakeVault(),
      spyFetch(() => respond('', { status: 404 })).fetch,
    );
    expect((await service.connect(FEED)).error).toMatch(/reset/i);
  });
});

describe('refresh', () => {
  it('keeps the previous events when a fetch fails', async () => {
    // An unreachable calendar is not an empty one, and the two look identical
    // to a user unless the events survive.
    let fail = false;
    const service = new CalendarService(
      fakeVault(),
      spyFetch(() => (fail ? respond('', { status: 500 }) : respond(icsWith('Standup')))).fetch,
    );

    await service.connect(FEED);
    expect(service.cached).toHaveLength(1);

    fail = true;
    const status = await service.refresh();
    expect(service.cached).toHaveLength(1);
    expect(status.error).toBeDefined();
    expect(status.eventCount).toBe(1);
  });

  it('sends If-None-Match once it has an etag', async () => {
    const { fetch: impl, calls } = spyFetch(() =>
      respond(icsWith('Standup'), { headers: { etag: 'W/"v1"' } }),
    );
    const service = new CalendarService(fakeVault(), impl);

    await service.connect(FEED);
    await service.refresh();

    const headers = calls[1]?.init?.headers as Record<string, string> | undefined;
    expect(headers?.['If-None-Match']).toBe('W/"v1"');
  });

  it('treats 304 as success and keeps the cached events', async () => {
    let first = true;
    const service = new CalendarService(
      fakeVault(),
      spyFetch(() => {
        if (first) {
          first = false;
          return respond(icsWith('Standup'), { headers: { etag: 'W/"v1"' } });
        }
        return respond('', { status: 304 });
      }).fetch,
    );

    await service.connect(FEED);
    const before = service.cached;
    const status = await service.refresh();

    expect(service.cached).toBe(before);
    expect(status.error).toBeUndefined();
    expect(status.lastSyncAt).not.toBeNull();
  });

  it('does nothing when no feed is configured', async () => {
    const { fetch: impl, calls } = spyFetch(() => respond(icsWith('x')));
    const service = new CalendarService(fakeVault(), impl);
    const status = await service.refresh();
    expect(calls).toHaveLength(0);
    expect(status.connected).toBe(false);
  });

  it('does not run two fetches at once', async () => {
    // Overlapping fetches race to set the cache, and the slower one can land
    // last and overwrite fresher data with staler.
    let resolveFetch: ((r: Response) => void) | null = null;
    const impl = (async () =>
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      })) as unknown as FetchLike;

    const service = new CalendarService(fakeVault(FEED), impl);
    const first = service.refresh();
    const second = await service.refresh();

    expect(second.syncing).toBe(true);
    resolveFetch?.(respond(icsWith('Standup')));
    await first;
    expect(service.cached).toHaveLength(1);
  });

  it('rejects a feed larger than the ceiling', async () => {
    // The whole document is parsed into memory, so this is a ceiling on
    // someone else's file.
    const service = new CalendarService(
      fakeVault(FEED),
      spyFetch(() =>
        respond(icsWith('Huge'), { headers: { 'content-length': String(50 * 1024 * 1024) } }),
      ).fetch,
    );
    const status = await service.refresh();
    expect(status.error).toMatch(/too large/i);
  });
});

describe('status', () => {
  it('starts disconnected and empty', () => {
    const status = new CalendarService(fakeVault()).status();
    expect(status).toMatchObject({ connected: false, eventCount: 0, lastSyncAt: null });
  });

  it('never exposes the feed URL', async () => {
    const service = new CalendarService(
      fakeVault(),
      spyFetch(() => respond(icsWith('Standup'))).fetch,
    );
    await service.connect(FEED);
    const status = service.status();
    expect(JSON.stringify(status)).not.toContain('private-token');
    expect(status.redacted).toContain('calendar.example.com');
  });

  it('clears everything on disconnect', async () => {
    const service = new CalendarService(
      fakeVault(),
      spyFetch(() => respond(icsWith('Standup'))).fetch,
    );
    await service.connect(FEED);

    const status = service.disconnect();
    expect(status.connected).toBe(false);
    expect(status.eventCount).toBe(0);
    expect(service.cached).toHaveLength(0);
  });

  it('notifies listeners when the connection changes', async () => {
    const seen: number[] = [];
    const service = new CalendarService(
      fakeVault(),
      spyFetch(() => respond(icsWith('Standup'))).fetch,
    );
    service.onChange((s) => seen.push(s.eventCount));

    await service.connect(FEED);
    expect(seen).toContain(1);
  });

  it('stops notifying after unsubscribe', async () => {
    let count = 0;
    const service = new CalendarService(
      fakeVault(),
      spyFetch(() => respond(icsWith('Standup'))).fetch,
    );
    const off = service.onChange(() => {
      count += 1;
    });
    off();
    await service.connect(FEED);
    expect(count).toBe(0);
  });
});
