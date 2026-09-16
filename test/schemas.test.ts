import { describe, expect, it } from 'vitest';
import { safeParsePlayerResponse } from '../src/core/schemas/playerResponse';
import { safeParseTimedText } from '../src/core/schemas/timedText';

/** The subset of the raw shape these tests build by hand. */
type RawCaptionTrack = {
  baseUrl?: string;
  languageCode?: string;
  name?: { simpleText?: string; runs?: { text: string }[] };
  vssId?: string;
  kind?: string;
};

type RawPlayerResponse = {
  captions: {
    playerCaptionsTracklistRenderer: {
      captionTracks: RawCaptionTrack[];
      audioTracks?: { captionTrackIndices: number[]; defaultCaptionTrackIndex?: number }[];
      defaultAudioTrackIndex?: number;
    };
  };
  videoDetails: {
    videoId?: string;
    title?: string;
    author?: string;
    lengthSeconds?: string;
    isLive?: boolean;
  };
  microformat: { playerMicroformatRenderer?: { defaultAudioLanguage?: string } };
  playabilityStatus: { status?: string; reason?: string };
};

/**
 * A minimal but realistically shaped player response.
 *
 * Captured fixtures replace this where realism matters; these cases are about
 * leniency, which is easier to state explicitly than to find in a real capture.
 */
function playerResponse(): RawPlayerResponse {
  return {
    captions: {
      playerCaptionsTracklistRenderer: {
        captionTracks: [
          {
            baseUrl: 'https://www.youtube.com/api/timedtext?lang=en',
            languageCode: 'en',
            name: { simpleText: 'English' },
            vssId: '.en',
          },
        ],
        audioTracks: [{ captionTrackIndices: [0] }],
        defaultAudioTrackIndex: 0,
      },
    },
    videoDetails: {
      videoId: 'abc123',
      title: 'Some Video',
      author: 'Some Channel',
      lengthSeconds: '600',
      isLive: false,
    },
    microformat: { playerMicroformatRenderer: { defaultAudioLanguage: 'en' } },
    playabilityStatus: { status: 'OK' },
  };
}

describe('safeParsePlayerResponse', () => {
  it('reduces a well-formed response to a player context', () => {
    const result = safeParsePlayerResponse(playerResponse(), 'abc123');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.meta).toEqual({
      videoId: 'abc123',
      title: 'Some Video',
      channel: 'Some Channel',
      durationSec: 600,
      isLive: false,
    });
    expect(result.value.tracks).toHaveLength(1);
    expect(result.value.audio.defaultAudioLanguage).toBe('en');
  });

  it('survives unexpected extra keys at every level', () => {
    const raw = playerResponse() as Record<string, unknown>;
    raw.someBrandNewField = { nested: true };
    const renderer = (raw.captions as RawPlayerResponse['captions'])
      .playerCaptionsTracklistRenderer as unknown as Record<string, unknown>;
    renderer.unexpected = [1, 2, 3];
    renderer.captionTracks = [
      { baseUrl: 'https://example.com/t', languageCode: 'en', futureFlag: 'yes' },
    ];

    expect(safeParsePlayerResponse(raw, 'abc123').ok).toBe(true);
  });

  it('survives missing optional fields', () => {
    const raw = {
      captions: {
        playerCaptionsTracklistRenderer: {
          captionTracks: [{ baseUrl: 'https://example.com/t', languageCode: 'fr' }],
        },
      },
    };

    const result = safeParsePlayerResponse(raw, 'fallback-id');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.meta.videoId).toBe('fallback-id');
    expect(result.value.meta.title).toBe('Untitled');
    expect(result.value.tracks[0]?.name).toBe('');
  });

  it('reads a track name given as runs', () => {
    const raw = playerResponse();
    // The alternative shape YouTube also emits.
    raw.captions.playerCaptionsTracklistRenderer.captionTracks = [
      {
        baseUrl: 'https://www.youtube.com/api/timedtext?lang=en',
        languageCode: 'en',
        name: { runs: [{ text: 'English ' }, { text: '(auto-generated)' }] },
      },
    ];

    const result = safeParsePlayerResponse(raw, 'abc123');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.tracks[0]?.name).toBe('English (auto-generated)');
  });

  it('strips a translation parameter carried by a received URL', () => {
    const raw = playerResponse();
    raw.captions.playerCaptionsTracklistRenderer.captionTracks = [
      { baseUrl: 'https://www.youtube.com/api/timedtext?lang=fr&tlang=en', languageCode: 'fr' },
    ];

    const result = safeParsePlayerResponse(raw, 'abc123');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.tracks[0]?.baseUrl).not.toContain('tlang');
  });

  it('drops a track that has no usable URL rather than failing', () => {
    const raw = playerResponse();
    // A malformed entry, which YouTube does occasionally emit.
    raw.captions.playerCaptionsTracklistRenderer.captionTracks.push({
      baseUrl: '',
      languageCode: 'de',
      name: { simpleText: 'German' },
      vssId: '.de',
    });

    const result = safeParsePlayerResponse(raw, 'abc123');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.tracks).toHaveLength(1);
  });

  it('reports no-caption-tracks when captions are absent', () => {
    const { captions: _captions, ...raw } = playerResponse();

    expect(safeParsePlayerResponse(raw, 'abc123')).toEqual({
      ok: false,
      error: { kind: 'no-caption-tracks' },
    });
  });

  it('reports live-stream before looking at tracks', () => {
    const raw = playerResponse();
    raw.videoDetails.isLive = true;

    expect(safeParsePlayerResponse(raw, 'abc123')).toEqual({
      ok: false,
      error: { kind: 'live-stream' },
    });
  });

  it('reports restricted-video for a non-OK playability status', () => {
    const raw = playerResponse();
    raw.playabilityStatus = { status: 'LOGIN_REQUIRED', reason: 'Sign in to confirm your age' };

    const result = safeParsePlayerResponse(raw, 'abc123');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('restricted-video');
    expect(result.error.detail).toBe('Sign in to confirm your age');
  });

  it('reports the failing path when a structure moves', () => {
    const result = safeParsePlayerResponse({ captions: 'not an object' }, 'abc123');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('schema-mismatch');
    expect(result.error.path).toBe('captions');
  });
});

describe('safeParseTimedText', () => {
  it('concatenates the segments of each event', () => {
    const result = safeParseTimedText({
      events: [{ tStartMs: 0, dDurationMs: 2000, segs: [{ utf8: 'hello ' }, { utf8: 'there' }] }],
    });

    expect(result).toEqual({
      ok: true,
      value: [{ startMs: 0, durationMs: 2000, text: 'hello there' }],
    });
  });

  it('drops timing-only events that carry no text', () => {
    const result = safeParseTimedText({
      events: [
        { tStartMs: 0, dDurationMs: 100 },
        { tStartMs: 100, dDurationMs: 100, segs: [{ utf8: '\n' }] },
        { tStartMs: 200, dDurationMs: 2000, segs: [{ utf8: 'real text' }] },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(1);
  });

  it('survives unexpected extra keys', () => {
    const result = safeParseTimedText({
      wireMagic: 'pb3',
      pens: [{}],
      events: [{ tStartMs: 0, dDurationMs: 1, segs: [{ utf8: 'hi', acAsrConf: 0 }], id: 1 }],
    });

    expect(result.ok).toBe(true);
  });

  it('reports empty-track when no event carries text', () => {
    expect(safeParseTimedText({ events: [] })).toEqual({
      ok: false,
      error: { kind: 'empty-track' },
    });
  });

  it('reports schema-mismatch when events is not an array', () => {
    const result = safeParseTimedText({ events: 'nope' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('schema-mismatch');
    expect(result.error.path).toBe('events');
  });
});
