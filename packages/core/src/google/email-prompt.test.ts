import { describe, it, expect } from 'vitest';
import { buildEmailReplyPrompt, parseEmailReplyResponse } from './email-prompt.js';

describe('buildEmailReplyPrompt', () => {
  it('includes the user name in the system prompt', () => {
    const { system } = buildEmailReplyPrompt({
      fromEmail: 'alice@example.com',
      subject: 'Hello',
      bodyText: 'Hey there',
      userName: 'Manula',
    });
    expect(system).toContain('Manula');
  });

  it('includes the email body in the user prompt', () => {
    const { prompt } = buildEmailReplyPrompt({
      fromEmail: 'bob@example.com',
      subject: 'Meeting',
      bodyText: 'Are we still on for Tuesday?',
      userName: 'Test User',
    });
    expect(prompt).toContain('Are we still on for Tuesday?');
    expect(prompt).toContain('bob@example.com');
    expect(prompt).toContain('Meeting');
  });

  it('applies professional tone by default', () => {
    const { system } = buildEmailReplyPrompt({
      fromEmail: 'a@b.com',
      subject: 'x',
      bodyText: 'y',
      userName: 'User',
    });
    expect(system).toContain('professional');
  });

  it('applies friendly tone when specified', () => {
    const { system } = buildEmailReplyPrompt({
      fromEmail: 'a@b.com',
      subject: 'x',
      bodyText: 'y',
      userName: 'User',
      tone: 'friendly',
    });
    expect(system).toContain('friendly');
  });

  it('applies brief tone when specified', () => {
    const { system } = buildEmailReplyPrompt({
      fromEmail: 'a@b.com',
      subject: 'x',
      bodyText: 'y',
      userName: 'User',
      tone: 'brief',
    });
    expect(system).toContain('short');
  });

  it('instructs LLM to return JSON with required keys', () => {
    const { system } = buildEmailReplyPrompt({
      fromEmail: 'a@b.com',
      subject: 'x',
      bodyText: 'y',
      userName: 'User',
    });
    expect(system).toContain('suggestedSubject');
    expect(system).toContain('draftReply');
  });
});

describe('parseEmailReplyResponse', () => {
  it('parses a valid JSON response', () => {
    const raw = JSON.stringify({
      suggestedSubject: 'Re: Hello',
      draftReply: 'Hi Alice, thanks for reaching out!',
    });
    const result = parseEmailReplyResponse(raw);
    expect(result).not.toBeNull();
    expect(result?.suggestedSubject).toBe('Re: Hello');
    expect(result?.draftReply).toBe('Hi Alice, thanks for reaching out!');
  });

  it('strips markdown code fences before parsing', () => {
    const raw = '```json\n{"suggestedSubject":"Re: Test","draftReply":"Hello!"}\n```';
    const result = parseEmailReplyResponse(raw);
    expect(result).not.toBeNull();
    expect(result?.draftReply).toBe('Hello!');
  });

  it('returns null for invalid JSON', () => {
    expect(parseEmailReplyResponse('not json at all')).toBeNull();
  });

  it('returns null when draftReply is missing', () => {
    const raw = JSON.stringify({ suggestedSubject: 'Re: X' });
    expect(parseEmailReplyResponse(raw)).toBeNull();
  });

  it('returns null when draftReply is empty string', () => {
    const raw = JSON.stringify({ suggestedSubject: 'Re: X', draftReply: '' });
    expect(parseEmailReplyResponse(raw)).toBeNull();
  });

  it('handles a response without markdown fences', () => {
    const raw = '{"suggestedSubject":"Re: Feedback","draftReply":"Thank you for the feedback!"}';
    const result = parseEmailReplyResponse(raw);
    expect(result?.suggestedSubject).toBe('Re: Feedback');
    expect(result?.draftReply).toBe('Thank you for the feedback!');
  });
});
