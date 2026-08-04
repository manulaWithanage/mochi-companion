import { describe, expect, it } from 'vitest';
import { buildAgenda, describeAge, type AgendaItem } from './agenda.js';
import { createTask, type Task } from '../tasks/tasks.js';
import type { CachedInboxItem } from '../google/email-state.js';
import type { CalendarEvent } from '../calendar/calendar.js';

/**
 * The rule these protect: `needsYou` is finishable and counted, `schedule` is
 * not. A checkbox next to something you cannot complete makes the count
 * meaningless, and the count reaching zero is the only thing this view offers
 * that an inbox does not.
 */

/** 2026-08-04 14:00 local. */
const NOW = new Date(2026, 7, 4, 14, 0, 0);
const at = (h: number, m = 0): number => new Date(2026, 7, 4, h, m, 0).getTime();

function task(over: Partial<Task> & { id: string; title: string }): Task {
  const result = createTask({ id: over.id, title: over.title, now: NOW });
  if (!result.ok) throw new Error(result.error);
  return { ...result.task, ...over };
}

function email(over: Partial<CachedInboxItem> & { emailId: string }): CachedInboxItem {
  return {
    account: 'a@b.com',
    threadId: `t-${over.emailId}`,
    uid: 1,
    messageId: `m-${over.emailId}`,
    fromName: 'Sarah',
    fromAddress: 'sarah@example.com',
    replyToAddress: 'sarah@example.com',
    toAddresses: [],
    ccAddresses: [],
    subject: 'Contract review',
    receivedAt: at(12),
    category: 'primary',
    labels: [],
    snippet: '',
    inInbox: true,
    priority: {
      account: 'a@b.com',
      emailId: over.emailId,
      tier: 'urgent',
      replyLikely: true,
      confidence: 0.9,
      reason: 'asks for confirmation',
      classifiedAt: at(12),
    },
    draft: null,
    reminder: null,
    ...over,
  } as CachedInboxItem;
}

function event(over: Partial<CalendarEvent> & { id: string }): CalendarEvent {
  return {
    title: 'Standup',
    startsAt: at(15),
    endsAt: at(15, 30),
    allDay: false,
    cancelled: false,
    attendance: 'accepted',
    ...over,
  } as CalendarEvent;
}

const ids = (items: readonly AgendaItem[]): string[] => items.map((i) => i.id);

describe('what counts as work', () => {
  it('puts replies and due tasks in the finishable list', () => {
    const agenda = buildAgenda({
      tasks: [task({ id: 't1', title: 'Dentist form', dueOn: '2026-08-04' })],
      emails: [email({ emailId: 'e1' })],
      events: [],
      now: NOW,
    });

    expect(ids(agenda.needsYou)).toEqual(['email:e1', 'task:t1']);
  });

  it('keeps meetings out of it entirely', () => {
    // You cannot finish a meeting. A tick box beside one is a lie.
    const agenda = buildAgenda({
      tasks: [],
      emails: [],
      events: [event({ id: 'v1' })],
      now: NOW,
    });

    expect(agenda.needsYou).toEqual([]);
    expect(ids(agenda.schedule)).toEqual(['event:v1']);
  });

  it('never marks a meeting late', () => {
    // A meeting you missed is not work you owe; a red row no action can clear.
    const agenda = buildAgenda({
      tasks: [],
      emails: [],
      events: [event({ id: 'past', startsAt: at(9), endsAt: at(9, 30) })],
      now: NOW,
    });

    expect(agenda.schedule[0]?.late).toBe(false);
  });

  it('includes yesterday’s unfinished task, marked late', () => {
    // Still work you owe today. Hiding it until you visit Tasks is how it stays
    // undone.
    const agenda = buildAgenda({
      tasks: [task({ id: 'old', title: 'Invoice', dueOn: '2026-08-03' })],
      emails: [],
      events: [],
      now: NOW,
    });

    expect(agenda.needsYou[0]?.late).toBe(true);
    expect(agenda.needsYou[0]?.detail).toBe('overdue');
  });

  it('leaves someday and future tasks out', () => {
    const agenda = buildAgenda({
      tasks: [
        task({ id: 'someday', title: 'Learn piano', dueOn: null }),
        task({ id: 'later', title: 'Renew passport', dueOn: '2026-08-09' }),
      ],
      emails: [],
      events: [],
      now: NOW,
    });

    expect(agenda.needsYou).toEqual([]);
  });

  it('leaves a finished task out', () => {
    const agenda = buildAgenda({
      tasks: [task({ id: 'done', title: 'Done thing', dueOn: '2026-08-04', doneAt: at(10) })],
      emails: [],
      events: [],
      now: NOW,
    });

    expect(agenda.needsYou).toEqual([]);
  });
});

describe('email replies', () => {
  it('drops one already replied to', () => {
    // Otherwise answered mail sits in the list for ever — the pile this exists
    // to prevent.
    const agenda = buildAgenda({
      tasks: [],
      emails: [
        email({
          emailId: 'replied',
          reminder: { state: 'replied' } as CachedInboxItem['reminder'],
        }),
      ],
      events: [],
      now: NOW,
    });

    expect(agenda.needsYou).toEqual([]);
  });

  it('drops one the user waved away', () => {
    const agenda = buildAgenda({
      tasks: [],
      emails: [
        email({
          emailId: 'gone',
          reminder: { state: 'dismissed' } as CachedInboxItem['reminder'],
        }),
      ],
      events: [],
      now: NOW,
    });

    expect(agenda.needsYou).toEqual([]);
  });

  it('drops one the classifier is unsure about', () => {
    const agenda = buildAgenda({
      tasks: [],
      emails: [
        email({
          emailId: 'unsure',
          priority: { ...email({ emailId: 'unsure' }).priority!, confidence: 0.4 },
        }),
      ],
      events: [],
      now: NOW,
    });

    expect(agenda.needsYou).toEqual([]);
  });

  it('is late only once it is more than a day old', () => {
    // Shouting about a mail from an hour ago trains people to ignore emphasis.
    const fresh = buildAgenda({
      tasks: [],
      emails: [email({ emailId: 'fresh', receivedAt: at(12) })],
      events: [],
      now: NOW,
    });
    const stale = buildAgenda({
      tasks: [],
      emails: [email({ emailId: 'stale', receivedAt: at(12) - 2 * 86_400_000 })],
      events: [],
      now: NOW,
    });

    expect(fresh.needsYou[0]?.late).toBe(false);
    expect(stale.needsYou[0]?.late).toBe(true);
  });

  it('names the sender and how long it has waited', () => {
    const agenda = buildAgenda({
      tasks: [],
      emails: [email({ emailId: 'e1', fromName: 'Sarah', receivedAt: at(12) })],
      events: [],
      now: NOW,
    });

    expect(agenda.needsYou[0]?.detail).toBe('Sarah · 2 hours ago');
  });

  it('falls back to the address when there is no display name', () => {
    const agenda = buildAgenda({
      tasks: [],
      emails: [email({ emailId: 'e1', fromName: '   ' })],
      events: [],
      now: NOW,
    });

    expect(agenda.needsYou[0]?.detail).toContain('sarah@example.com');
  });
});

describe('the calendar half', () => {
  it('shows a meeting already running as on now', () => {
    const agenda = buildAgenda({
      tasks: [],
      emails: [],
      events: [event({ id: 'live', startsAt: at(13, 45), endsAt: at(14, 30) })],
      now: NOW,
    });

    expect(agenda.schedule[0]?.detail).toBe('on now');
  });

  it('drops cancelled, declined and all-day entries', () => {
    // Each exclusion exists because including it made the day look busier than
    // it was. A birthday is not a commitment.
    const agenda = buildAgenda({
      tasks: [],
      emails: [],
      events: [
        event({ id: 'cancelled', cancelled: true }),
        event({ id: 'declined', attendance: 'declined' }),
        event({ id: 'birthday', allDay: true }),
        event({ id: 'real' }),
      ],
      now: NOW,
    });

    expect(ids(agenda.schedule)).toEqual(['event:real']);
  });

  it('leaves tomorrow out', () => {
    const agenda = buildAgenda({
      tasks: [],
      emails: [],
      events: [
        event({
          id: 'tomorrow',
          startsAt: at(15) + 86_400_000,
          endsAt: at(16) + 86_400_000,
        }),
      ],
      now: NOW,
    });

    expect(agenda.schedule).toEqual([]);
  });
});

describe('reading order', () => {
  it('puts late things first, then the timed ones in order', () => {
    const agenda = buildAgenda({
      tasks: [
        task({ id: 'late', title: 'Overdue thing', dueOn: '2026-08-03' }),
        task({ id: 'at16', title: 'Later', dueOn: '2026-08-04', remindAt: at(16) }),
        task({ id: 'at15', title: 'Sooner', dueOn: '2026-08-04', remindAt: at(15) }),
      ],
      emails: [],
      events: [],
      now: NOW,
    });

    expect(ids(agenda.needsYou)).toEqual(['task:late', 'task:at15', 'task:at16']);
  });

  it('sinks untimed items below timed ones', () => {
    // An untimed task sprinkled among timed ones reads as though it had a slot.
    const agenda = buildAgenda({
      tasks: [
        task({ id: 'untimed', title: 'Whenever', dueOn: '2026-08-04' }),
        task({ id: 'timed', title: 'At four', dueOn: '2026-08-04', remindAt: at(16) }),
      ],
      emails: [],
      events: [],
      now: NOW,
    });

    expect(ids(agenda.needsYou)).toEqual(['task:timed', 'task:untimed']);
  });

  it('is stable for two things at the same moment', () => {
    const agenda = buildAgenda({
      tasks: [
        task({ id: 'b', title: 'Beta', dueOn: '2026-08-04', remindAt: at(16) }),
        task({ id: 'a', title: 'Alpha', dueOn: '2026-08-04', remindAt: at(16) }),
      ],
      emails: [],
      events: [],
      now: NOW,
    });

    expect(ids(agenda.needsYou)).toEqual(['task:a', 'task:b']);
  });
});

describe('describeAge', () => {
  it('rounds coarsely, because precision here is noise', () => {
    const now = at(14);
    expect(describeAge(now, now)).toBe('just now');
    expect(describeAge(now - 30_000, now)).toBe('just now');
    expect(describeAge(now - 5 * 60_000, now)).toBe('5 min ago');
    expect(describeAge(now - 60 * 60_000, now)).toBe('1 hour ago');
    expect(describeAge(now - 3 * 60 * 60_000, now)).toBe('3 hours ago');
    expect(describeAge(now - 26 * 60 * 60_000, now)).toBe('1 day ago');
    expect(describeAge(now - 72 * 60 * 60_000, now)).toBe('3 days ago');
  });

  it('does not report a future timestamp as negative', () => {
    // Clock skew between the mail server and this machine is normal.
    const now = at(14);
    expect(describeAge(now + 60_000, now)).toBe('just now');
  });
});

describe('the empty day', () => {
  it('returns two empty lists rather than throwing', () => {
    const agenda = buildAgenda({ tasks: [], emails: [], events: [], now: NOW });

    expect(agenda.needsYou).toEqual([]);
    expect(agenda.schedule).toEqual([]);
  });
});
