import { describe, expect, it } from 'vitest';
import {
  cleanSegments,
  cleanText,
  deduplicateAsr,
  GROUP_TARGET_MS,
  groupSegments,
} from '../src/core/normalize';
import type { TranscriptSegment } from '../src/core/types';

/** Builds a segment list from [startSec, text] pairs, each two seconds long. */
function segments(entries: [number, string][], durationSec = 2): TranscriptSegment[] {
  return entries.map(([startSec, text]) => ({
    startMs: startSec * 1000,
    durationMs: durationSec * 1000,
    text,
  }));
}

function bigramRepeats(text: string): string[] {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  const repeats: string[] = [];
  for (let i = 0; i + 3 < words.length; i++) {
    const first = `${words[i]} ${words[i + 1]}`;
    const second = `${words[i + 2]} ${words[i + 3]}`;
    if (first === second) repeats.push(first);
  }
  return repeats;
}

describe('cleanText', () => {
  it('strips bracketed annotations', () => {
    expect(cleanText('[Music] hello there [Applause]')).toBe('hello there');
  });

  it('normalizes non-breaking spaces and control characters', () => {
    expect(cleanText('hello there')).toBe('hello there');
  });

  it('collapses internal line breaks and repeated whitespace', () => {
    expect(cleanText('hello\n  there\tworld')).toBe('hello there world');
  });

  it('leaves punctuation and capitalization alone', () => {
    expect(cleanText('Hello, there. we dont fix THIS')).toBe('Hello, there. we dont fix THIS');
  });
});

describe('deduplicateAsr', () => {
  it('removes the sliding-window overlap', () => {
    const input = segments([
      [0, 'the quick brown fox'],
      [2, 'the quick brown fox jumps over'],
      [4, 'fox jumps over the lazy dog'],
      [6, 'the lazy dog and then sleeps'],
    ]);

    const text = deduplicateAsr(input)
      .map((segment) => segment.text)
      .join(' ');

    expect(text).toBe('the quick brown fox jumps over the lazy dog and then sleeps');
    expect(bigramRepeats(text)).toEqual([]);
  });

  it('drops a line that repeats the previous one entirely', () => {
    const output = deduplicateAsr(
      segments([
        [0, 'hello there'],
        [2, 'hello there'],
        [4, 'general kenobi'],
      ]),
    );

    expect(output.map((segment) => segment.text)).toEqual(['hello there', 'general kenobi']);
  });

  it('ignores punctuation and case when matching the overlap', () => {
    const output = deduplicateAsr(
      segments([
        [0, 'so we begin'],
        [2, 'So, we begin — with the basics'],
      ]),
    );

    expect(output.map((segment) => segment.text)).toEqual(['so we begin', 'with the basics']);
  });

  it('skips empty and annotation-only segments', () => {
    const output = deduplicateAsr(
      segments([
        [0, '[Music]'],
        [2, '   '],
        [4, 'first words'],
      ]),
    );

    expect(output.map((segment) => segment.text)).toEqual(['first words']);
  });

  it('keeps the start time of the segment the surviving words came from', () => {
    const output = deduplicateAsr(
      segments([
        [10, 'alpha beta'],
        [12, 'alpha beta gamma'],
      ]),
    );

    expect(output[1]).toEqual({ startMs: 12_000, durationMs: 2000, text: 'gamma' });
  });

  it('does not merge a repetition that falls outside the lookback window', () => {
    const filler = Array.from({ length: 20 }, (_, i) => `word${i}`).join(' ');
    const output = deduplicateAsr(
      segments([
        [0, 'alpha beta'],
        [2, filler],
        [4, 'alpha beta'],
      ]),
    );

    expect(output).toHaveLength(3);
    expect(output[2]?.text).toBe('alpha beta');
  });
});

describe('cleanSegments', () => {
  it('leaves legitimate repetition in manual tracks intact', () => {
    const input = segments([
      [0, 'Never, never, never give up.'],
      [2, 'Never give up.'],
    ]);

    expect(cleanSegments(input).map((segment) => segment.text)).toEqual([
      'Never, never, never give up.',
      'Never give up.',
    ]);
  });
});

describe('groupSegments', () => {
  it('starts a block at the timestamp of its first segment', () => {
    const blocks = groupSegments(
      segments([
        [30, 'hello'],
        [32, 'world'],
      ]),
    );
    expect(blocks[0]?.startMs).toBe(30_000);
  });

  it('closes a block at the target when the sentence ends there', () => {
    const input = segments(
      [
        [0, 'first part.'],
        [58, 'second part.'],
        [62, 'third part.'],
      ],
      2,
    );

    const blocks = groupSegments(input);

    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.text).toBe('first part. second part.');
    expect(blocks[1]?.text).toBe('third part.');
  });

  it('overruns the target rather than cutting mid-sentence', () => {
    const input = segments(
      [
        [0, 'opening line'],
        [58, 'still going'],
        [70, 'and now it ends.'],
        [74, 'next block'],
      ],
      2,
    );

    const blocks = groupSegments(input);

    expect(blocks[0]?.text).toBe('opening line still going and now it ends.');
    expect(blocks[1]?.text).toBe('next block');
  });

  it('closes at the 1.5x ceiling when punctuation never arrives', () => {
    const input = segments(
      Array.from({ length: 60 }, (_, i) => [i * 2, `word${i}`] as [number, string]),
      2,
    );

    const blocks = groupSegments(input);

    for (const block of blocks.slice(0, -1)) {
      const wordCount = block.text.split(' ').length;
      // Two seconds per segment, so a 90s ceiling means at most 45 segments.
      expect(wordCount).toBeLessThanOrEqual(45);
    }
    expect(blocks.length).toBeGreaterThan(1);
  });

  it('honours a custom target duration', () => {
    const input = segments(
      Array.from({ length: 30 }, (_, i) => [i * 2, `word${i}`] as [number, string]),
      2,
    );

    const short = groupSegments(input, 10_000);
    const long = groupSegments(input, GROUP_TARGET_MS);

    expect(short.length).toBeGreaterThan(long.length);
  });

  it('returns nothing for an empty transcript', () => {
    expect(groupSegments([])).toEqual([]);
  });
});
