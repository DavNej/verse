import { describe, expect, it } from 'vitest';
import { stripTranslationParams } from '../src/core/schemas/playerResponse';
import { selectOriginalTrack } from '../src/core/trackSelector';
import type { AudioTrackInfo, CaptionTrack } from '../src/core/types';

function track(languageCode: string, kind?: 'asr'): CaptionTrack {
  return {
    baseUrl: `https://www.youtube.com/api/timedtext?lang=${languageCode}`,
    languageCode,
    name: `${languageCode}${kind === 'asr' ? ' (auto-generated)' : ''}`,
    kind,
  };
}

const noAudioInfo: AudioTrackInfo = { audioTracks: [] };

describe('selectOriginalTrack', () => {
  it('reports no-caption-tracks for an empty list', () => {
    const result = selectOriginalTrack([], noAudioInfo);
    expect(result).toEqual({ ok: false, error: { kind: 'no-caption-tracks' } });
  });

  it('follows the default audio track index', () => {
    // A dubbed video: English captions are listed first, but Japanese is the original.
    const tracks = [track('en'), track('ja')];
    const audio: AudioTrackInfo = {
      audioTracks: [
        { captionTrackIndices: [0] },
        { captionTrackIndices: [1], defaultCaptionTrackIndex: 1 },
      ],
      defaultAudioTrackIndex: 1,
    };

    const result = selectOriginalTrack(tracks, audio);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.track.languageCode).toBe('ja');
    expect(result.value.reason).toEqual({ kind: 'audio-track-default', languageCode: 'ja' });
  });

  it('prefers the manual track inside the resolved audio language', () => {
    const tracks = [track('fr', 'asr'), track('fr')];
    const audio: AudioTrackInfo = {
      audioTracks: [{ captionTrackIndices: [0, 1] }],
      defaultAudioTrackIndex: 0,
    };

    const result = selectOriginalTrack(tracks, audio);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.track.kind).toBeUndefined();
  });

  it('falls back to defaultAudioLanguage when audio tracks are absent', () => {
    const tracks = [track('en'), track('de')];
    const audio: AudioTrackInfo = { audioTracks: [], defaultAudioLanguage: 'de' };

    const result = selectOriginalTrack(tracks, audio);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.track.languageCode).toBe('de');
    expect(result.value.reason).toEqual({ kind: 'default-audio-language', languageCode: 'de' });
  });

  it('matches defaultAudioLanguage on the base subtag', () => {
    const tracks = [track('fr'), track('en-GB')];
    const audio: AudioTrackInfo = { audioTracks: [], defaultAudioLanguage: 'en-US' };

    const result = selectOriginalTrack(tracks, audio);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.track.languageCode).toBe('en-GB');
  });

  it('takes the first manual track when no audio metadata exists', () => {
    const tracks = [track('en', 'asr'), track('es')];

    const result = selectOriginalTrack(tracks, noAudioInfo);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.track.languageCode).toBe('es');
    expect(result.value.reason).toEqual({ kind: 'first-manual' });
  });

  it('takes the first track when only ASR tracks exist', () => {
    const tracks = [track('fr', 'asr'), track('it', 'asr')];

    const result = selectOriginalTrack(tracks, noAudioInfo);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.track.languageCode).toBe('fr');
    expect(result.value.reason).toEqual({ kind: 'first-available' });
  });

  it('ignores an out-of-range default audio track index', () => {
    const tracks = [track('en')];
    const audio: AudioTrackInfo = {
      audioTracks: [{ captionTrackIndices: [0] }],
      defaultAudioTrackIndex: 7,
    };

    const result = selectOriginalTrack(tracks, audio);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.reason).toEqual({ kind: 'first-manual' });
  });
});

describe('stripTranslationParams', () => {
  it('removes a translation parameter in the middle of a query', () => {
    const stripped = stripTranslationParams(
      'https://www.youtube.com/api/timedtext?lang=fr&tlang=en&v=abc',
    );
    expect(stripped).toBe('https://www.youtube.com/api/timedtext?lang=fr&v=abc');
  });

  it('removes a trailing translation parameter', () => {
    const stripped = stripTranslationParams(
      'https://www.youtube.com/api/timedtext?lang=fr&tlang=en',
    );
    expect(stripped).toBe('https://www.youtube.com/api/timedtext?lang=fr');
  });

  it('removes a leading translation parameter', () => {
    const stripped = stripTranslationParams('https://www.youtube.com/api/timedtext?tlang=en&v=abc');
    expect(stripped).toBe('https://www.youtube.com/api/timedtext?v=abc');
  });

  it('leaves an untranslated URL untouched', () => {
    const url = 'https://www.youtube.com/api/timedtext?lang=fr&v=abc';
    expect(stripTranslationParams(url)).toBe(url);
  });
});
