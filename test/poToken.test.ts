import { describe, expect, it } from 'vitest';
import { readPoToken, withPoToken } from '../src/core/poToken';

const PLAYER_REQUEST =
  'https://www.youtube.com/api/timedtext?v=abc123&ei=xyz&caps=asr&opi=1&xoaf=5&hl=en' +
  '&ip=0.0.0.0&ipbits=0&expire=1700000000&sparams=ip%2Cipbits%2Cexpire&signature=SIG' +
  '&key=yt8&kind=asr&lang=en&potc=1&pot=Mn-Ab_c%3D%3D&fmt=json3&xorb=2&c=WEB&cver=2.20251001.00.00';

const BASE_URL =
  'https://www.youtube.com/api/timedtext?v=abc123&ei=xyz&caps=asr&opi=1&xoaf=5&hl=en' +
  '&ip=0.0.0.0&ipbits=0&expire=1700000000&sparams=ip%2Cipbits%2Cexpire&signature=SIG' +
  '&key=yt8&kind=asr&lang=en';

describe('readPoToken', () => {
  it('reads the token and the client it was minted for from a player request', () => {
    expect(readPoToken(PLAYER_REQUEST)).toEqual({
      videoId: 'abc123',
      pot: 'Mn-Ab_c==',
      potc: '1',
      c: 'WEB',
      cver: '2.20251001.00.00',
    });
  });

  it('leaves out the optional parameters the request does not carry', () => {
    expect(readPoToken('https://www.youtube.com/api/timedtext?v=abc123&pot=TOKEN')).toEqual({
      videoId: 'abc123',
      pot: 'TOKEN',
    });
  });

  it('accepts other YouTube hosts', () => {
    expect(readPoToken('https://m.youtube.com/api/timedtext?v=abc123&pot=TOKEN')?.pot).toBe(
      'TOKEN',
    );
  });

  it('returns null for a timedtext request without a token', () => {
    expect(readPoToken(BASE_URL)).toBeNull();
  });

  it('returns null for a request without a video ID', () => {
    expect(readPoToken('https://www.youtube.com/api/timedtext?pot=TOKEN')).toBeNull();
  });

  it('returns null for an empty token', () => {
    expect(readPoToken('https://www.youtube.com/api/timedtext?v=abc123&pot=')).toBeNull();
  });

  it('returns null for another endpoint', () => {
    expect(readPoToken('https://www.youtube.com/api/stats/watchtime?v=abc123&pot=T')).toBeNull();
  });

  it('returns null for another site', () => {
    expect(readPoToken('https://notyoutube.com/api/timedtext?v=abc123&pot=TOKEN')).toBeNull();
  });

  it('returns null for something that is not a URL', () => {
    expect(readPoToken('not a url')).toBeNull();
  });
});

describe('withPoToken', () => {
  it('appends the token to a caption URL and keeps every other parameter verbatim', () => {
    const url = withPoToken(BASE_URL, { videoId: 'abc123', pot: 'Mn-Ab_c==', potc: '1' });

    expect(url).toBe(`${BASE_URL}&pot=Mn-Ab_c%3D%3D&potc=1`);
  });

  it('appends the client parameters when the token carries them', () => {
    const url = withPoToken('https://www.youtube.com/api/timedtext?v=abc123', {
      videoId: 'abc123',
      pot: 'T',
      c: 'WEB',
      cver: '2.1',
    });

    expect(url).toBe('https://www.youtube.com/api/timedtext?v=abc123&pot=T&c=WEB&cver=2.1');
  });

  it('replaces a stale token rather than sending two', () => {
    const url = withPoToken('https://www.youtube.com/api/timedtext?v=abc123&pot=OLD&lang=en', {
      videoId: 'abc123',
      pot: 'NEW',
    });

    expect(url).toBe('https://www.youtube.com/api/timedtext?v=abc123&lang=en&pot=NEW');
  });

  it('leaves the URL untouched when the token belongs to another video', () => {
    expect(withPoToken(BASE_URL, { videoId: 'other', pot: 'T' })).toBe(BASE_URL);
  });

  it('leaves a URL without a video ID untouched', () => {
    expect(
      withPoToken('https://www.youtube.com/api/timedtext', { videoId: 'abc123', pot: 'T' }),
    ).toBe('https://www.youtube.com/api/timedtext');
  });
});
