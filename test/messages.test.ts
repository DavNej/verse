import { describe, expect, it } from 'vitest';
import { messageForError } from '../src/components/Toast';
import type { ExtractionErrorKind } from '../src/core/types';

const ALL_KINDS: ExtractionErrorKind[] = [
  'no-player-response',
  'schema-mismatch',
  'no-caption-tracks',
  'empty-track',
  'consent-wall',
  'rate-limited',
  'network',
  'live-stream',
  'restricted-video',
  'not-a-watch-page',
];

describe('messageForError', () => {
  it('gives every error kind a distinct, non-empty message', () => {
    const messages = ALL_KINDS.map((kind) => messageForError({ kind }));

    for (const message of messages) {
      expect(message.length).toBeGreaterThan(0);
    }
    expect(new Set(messages).size).toBe(ALL_KINDS.length);
  });

  it('names the field that moved on a schema mismatch', () => {
    const message = messageForError({
      kind: 'schema-mismatch',
      path: 'captions.playerCaptionsTracklistRenderer',
    });

    expect(message).toContain('captions.playerCaptionsTracklistRenderer');
  });

  it('never leaks internal detail into the message', () => {
    const message = messageForError({ kind: 'network', detail: 'TypeError: failed to fetch' });

    expect(message).not.toContain('TypeError');
  });
});
