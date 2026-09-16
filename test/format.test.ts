import { describe, expect, it } from 'vitest';
import { formatTimestamp, timestampUrl, toMarkdown } from '../src/core/format';
import type { Transcript } from '../src/core/types';

const transcript: Transcript = {
  meta: {
    videoId: 'dQw4w9WgXcQ',
    title: 'A Talk About Things',
    channel: 'Some Channel',
    durationSec: 3725,
    isLive: false,
  },
  language: 'en',
  isAsr: false,
  blocks: [
    { startMs: 0, text: 'Opening remarks.' },
    { startMs: 61_000, text: 'The middle part.' },
    { startMs: 3_600_000, text: 'Closing remarks.' },
  ],
};

const extractedAt = new Date('2026-09-16T08:00:00Z');

describe('formatTimestamp', () => {
  it('renders MM:SS below an hour', () => {
    expect(formatTimestamp(61_000)).toBe('01:01');
  });

  it('renders HH:MM:SS at and above an hour', () => {
    expect(formatTimestamp(3_661_000)).toBe('1:01:01');
  });

  it('floors partial seconds', () => {
    expect(formatTimestamp(1999)).toBe('00:01');
  });
});

describe('timestampUrl', () => {
  it('links to the block start in whole seconds', () => {
    expect(timestampUrl('abc123', 61_500)).toBe('https://www.youtube.com/watch?v=abc123&t=61s');
  });
});

describe('toMarkdown', () => {
  it('renders the header block', () => {
    const markdown = toMarkdown(transcript, extractedAt);

    expect(markdown).toContain('# A Talk About Things');
    expect(markdown).toContain('- **Channel:** Some Channel');
    expect(markdown).toContain('- **URL:** https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(markdown).toContain('- **Duration:** 1:02:05');
    expect(markdown).toContain('- **Language:** en');
    expect(markdown).toContain('- **Extracted:** 2026-09-16');
  });

  it('marks auto-generated captions explicitly', () => {
    const markdown = toMarkdown({ ...transcript, isAsr: true }, extractedAt);

    expect(markdown).toContain('- **Language:** en (auto-generated captions)');
    expect(markdown).toContain('> Captions are auto-generated.');
  });

  it('says nothing about auto-generation for a manual track', () => {
    expect(toMarkdown(transcript, extractedAt)).not.toContain('auto-generated');
  });

  it('links every block timestamp to its own start second', () => {
    const markdown = toMarkdown(transcript, extractedAt);

    for (const block of transcript.blocks) {
      const stamp = formatTimestamp(block.startMs);
      const seconds = Math.floor(block.startMs / 1000);
      expect(markdown).toContain(
        `**[${stamp}](https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=${seconds}s)** ${block.text}`,
      );
    }
  });

  it('never emits a translation parameter', () => {
    expect(toMarkdown(transcript, extractedAt)).not.toContain('tlang');
  });
});
