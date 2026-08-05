import type { JSX } from 'react';
import { describeTriage, type CachedInboxItem, type ReplyItem, type ReplyQueue } from '@mochi/core';
import { button, C, card } from '../ui.js';
import { Icon, type IconName } from '../icons.js';
import { Tick } from '../Tick.js';

/**
 * The replies you owe, as a list that empties.
 *
 * Its own component for the same reason `GmailSettingsPanel` is: the Gmail tab is
 * already long, and a view with its own grouping and empty states does not want
 * to be another two hundred lines inside it.
 *
 * Grouped by what the mail wants from you rather than by how loud it is — see
 * `buildReplyQueue`. One tick box and one button per row, because the version
 * this replaces put seven controls on every row and six rows made forty-two
 * things at identical weight.
 */

/** Headings matched to the signal that formed the group. */
const GROUP_ICONS: Readonly<Record<string, IconName>> = {
  deadline: 'clock',
  action: 'hand',
  question: 'question',
  thread: 'thread',
  other: 'sparkle',
};

export interface GmailRepliesPanelProps {
  readonly queue: ReplyQueue;
  /** Total cached, only so the empty state can say what it looked at. */
  readonly cachedCount: number;
  /** Whether a model can be called right now, by any route. */
  readonly modelReady: boolean;
  findEmail(emailId: string): CachedInboxItem | undefined;
  onDraft(email: CachedInboxItem): void;
  onHandled(emailId: string): void;
  onSnooze(emailId: string): void;
}

function SignalChips({ signals }: { signals: readonly string[] }): JSX.Element | null {
  if (signals.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
      {signals.map((signal) => (
        <span
          key={signal}
          style={{
            fontSize: 10.5,
            color: C.dim,
            padding: '2px 7px',
            borderRadius: 999,
            border: `1px solid ${C.border}`,
          }}
        >
          {signal}
        </span>
      ))}
    </div>
  );
}

function Row({
  item,
  onDraft,
  onHandled,
  onSnooze,
}: {
  item: ReplyItem;
  onDraft(): void;
  onHandled(): void;
  onSnooze(): void;
}): JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11, padding: '10px 8px' }}>
      {/*
        Handled, not replied. The tick stops the reminder and sends nothing —
        the label says so, because claiming an outcome that never happened is
        exactly the sort of thing this app is careful about elsewhere.
      */}
      <div style={{ marginTop: 2 }}>
        <Tick label="Mark handled — stops the reminder, sends nothing" onDone={onHandled} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: C.text, lineHeight: 1.4 }}>{item.subject}</div>
        <div style={{ fontSize: 11, color: item.late ? C.warn : C.faint, marginTop: 2 }}>
          {item.who} · {item.age}
        </div>
        {/*
          Signal chips rather than the classifier's prose. A signal list is
          structurally incapable of being vacuous; the free-text reason sometimes
          only restates the subject, which is a highlighted row carrying nothing.
        */}
        <SignalChips signals={item.signals} />
      </div>

      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <button
          type="button"
          onClick={onDraft}
          style={{ ...button('ghost'), padding: '5px 11px', fontSize: 11.5 }}
        >
          Draft reply
        </button>
        <button
          type="button"
          onClick={onSnooze}
          title="Ask again in an hour"
          style={{ ...button('ghost'), padding: '5px 9px', fontSize: 11.5, color: C.faint }}
        >
          Snooze
        </button>
      </div>
    </div>
  );
}

export function GmailRepliesPanel({
  queue,
  cachedCount,
  modelReady,
  findEmail,
  onDraft,
  onHandled,
  onSnooze,
}: GmailRepliesPanelProps): JSX.Element {
  const draftFor = (emailId: string) => () => {
    const email = findEmail(emailId);
    if (email !== undefined) onDraft(email);
  };

  if (queue.total === 0 && queue.unsure.length === 0) {
    return (
      <div style={{ ...card, padding: '24px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 14, color: C.text, marginBottom: 5 }}>Nothing waiting on you.</div>
        <div style={{ fontSize: 12.5, color: C.dim }}>
          {/* Says what it looked at, so an empty list cannot be mistaken for a
              list that failed to load. */}
          The rest of the inbox can wait — {cachedCount}{' '}
          {cachedCount === 1 ? 'message' : 'messages'} checked.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 650, color: C.text }}>
        {queue.total === 0
          ? 'Nothing confirmed'
          : `${queue.total} ${queue.total === 1 ? 'reply' : 'replies'} need you`}
      </div>
      {/*
        How the list was built, stated rather than left to guess. With no model
        configured it is still complete and rules-scored, so this never implies
        something is missing — nor that a model was involved when none was.
      */}
      <div style={{ fontSize: 11.5, color: C.faint, margin: '3px 0 16px', lineHeight: 1.5 }}>
        {describeTriage(queue, modelReady)}
      </div>

      {queue.groups.map((group) => (
        <div key={group.id} style={{ marginBottom: 18 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              marginBottom: 8,
              fontSize: 12,
              color: C.dim,
              fontWeight: 600,
            }}
          >
            <Icon name={GROUP_ICONS[group.id] ?? 'sparkle'} size={14} color={C.accent} />
            <span>{group.label}</span>
            <span style={{ color: C.faint, fontWeight: 500 }}>{group.items.length}</span>
          </div>

          <div style={{ ...card, padding: '4px 6px' }}>
            {group.items.map((item) => (
              <Row
                key={item.emailId}
                item={item}
                onDraft={draftFor(item.emailId)}
                onHandled={() => onHandled(item.emailId)}
                onSnooze={() => onSnooze(item.emailId)}
              />
            ))}
          </div>
        </div>
      ))}

      {/*
        Asked, not asserted.

        These sit below the 0.75 confidence bar `needsReplyReminder` requires, so
        today they appear nowhere at all — the classifier half-suspected a reply
        was wanted and the thought was discarded. "62% sure" would be false
        precision on a guess, so it is put as the question it actually is.
      */}
      {queue.unsure.length > 0 && (
        <div>
          <div style={{ fontSize: 12, color: C.dim, fontWeight: 600, marginBottom: 8 }}>
            Not sure about these — worth a reply?
          </div>
          <div style={{ ...card, padding: '4px 6px', borderStyle: 'dashed' }}>
            {queue.unsure.map((item) => (
              <div
                key={item.emailId}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 8px' }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 12.5,
                      color: C.dim,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {item.subject}
                  </div>
                  <div style={{ fontSize: 11, color: C.faint, marginTop: 2 }}>
                    {item.who} · {item.age}
                  </div>
                </div>
                {/* Yes opens a draft; the row stays owed until it is actually
                    handled, which is the truthful outcome. No marks it handled.
                    Neither writes to settings. */}
                <button
                  type="button"
                  onClick={draftFor(item.emailId)}
                  style={{ ...button('ghost'), padding: '4px 13px', fontSize: 11.5 }}
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => onHandled(item.emailId)}
                  style={{
                    ...button('ghost'),
                    padding: '4px 13px',
                    fontSize: 11.5,
                    color: C.faint,
                  }}
                >
                  No
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
