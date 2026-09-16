import { describe, expect, it } from 'vitest';
import { isWatchUrl, videoIdFromUrl } from '../src/browser/navigation';

describe('videoIdFromUrl', () => {
  it('reads the video ID from a watch URL', () => {
    expect(videoIdFromUrl('https://www.youtube.com/watch?v=abc123&t=30s')).toBe('abc123');
  });

  it('reads the video ID from a Short', () => {
    expect(videoIdFromUrl('https://www.youtube.com/shorts/xyz789')).toBe('xyz789');
  });

  it('accepts other YouTube hosts', () => {
    expect(videoIdFromUrl('https://m.youtube.com/watch?v=abc123')).toBe('abc123');
  });

  it('returns null off a video page', () => {
    expect(videoIdFromUrl('https://www.youtube.com/feed/subscriptions')).toBeNull();
  });

  it('returns null for another site', () => {
    expect(videoIdFromUrl('https://example.com/watch?v=abc123')).toBeNull();
  });

  it('returns null for a host that merely ends in a lookalike domain', () => {
    expect(videoIdFromUrl('https://notyoutube.com/watch?v=abc123')).toBeNull();
  });

  it('returns null for an unparseable URL', () => {
    expect(videoIdFromUrl('not a url')).toBeNull();
  });
});

describe('isWatchUrl', () => {
  it('is true only where a video ID exists', () => {
    expect(isWatchUrl('https://www.youtube.com/watch?v=abc123')).toBe(true);
    expect(isWatchUrl('https://www.youtube.com/')).toBe(false);
  });
});
