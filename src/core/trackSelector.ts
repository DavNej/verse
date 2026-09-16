/**
 * Caption track selection.
 *
 * The goal is the language actually spoken in the video, never a translation
 * (SPEC 1.3). Dubbed videos are the trap: they expose several audio tracks, and the
 * one YouTube plays by default is not necessarily the original.
 */

import {
  type AudioTrackInfo,
  type CaptionTrack,
  type ExtractionError,
  err,
  extractionError,
  ok,
  type Result,
} from './types';

/** Why a track was chosen. Logged on every extraction and asserted in tests. */
export type SelectionReason =
  /** Followed audioTracks[defaultAudioTrackIndex] to its caption track. */
  | { kind: 'audio-track-default'; languageCode: string }
  /** Matched a defaultAudioLanguage field against languageCode. */
  | { kind: 'default-audio-language'; languageCode: string }
  /** No audio metadata: took the first manually written track. */
  | { kind: 'first-manual' }
  /** Nothing else applied: took whatever was listed first. */
  | { kind: 'first-available' };

export type TrackSelection = {
  track: CaptionTrack;
  reason: SelectionReason;
};

function isAsr(track: CaptionTrack): boolean {
  return track.kind === 'asr';
}

/**
 * Picks the best track for a language, preferring a manual track over an ASR one.
 *
 * Manual captions are punctuated, spelled correctly, and free of the sliding-window
 * artifact, so they win whenever both exist (SPEC 1.3).
 */
function preferManual(tracks: CaptionTrack[]): CaptionTrack | undefined {
  return tracks.find((track) => !isAsr(track)) ?? tracks[0];
}

function tracksForLanguage(tracks: CaptionTrack[], languageCode: string): CaptionTrack[] {
  // Match on the base subtag so 'en' also matches 'en-GB' and vice versa.
  const base = languageCode.split('-')[0]?.toLowerCase() ?? languageCode.toLowerCase();
  return tracks.filter((track) => track.languageCode.split('-')[0]?.toLowerCase() === base);
}

/**
 * Resolves the default audio track to the caption track it points at.
 *
 * audioTracks[] entries carry indices into captionTracks[], so this is the most
 * direct statement YouTube makes about which captions match the default audio.
 */
function fromAudioTracks(
  tracks: CaptionTrack[],
  audio: AudioTrackInfo,
): TrackSelection | undefined {
  const index = audio.defaultAudioTrackIndex;
  if (index === undefined) return undefined;

  const audioTrack = audio.audioTracks[index];
  if (!audioTrack) return undefined;

  const captionIndices = audioTrack.captionTrackIndices;
  const preferredIndex = audioTrack.defaultCaptionTrackIndex;
  const candidates: CaptionTrack[] = [];

  if (preferredIndex !== undefined) {
    const preferred = tracks[preferredIndex];
    if (preferred) candidates.push(preferred);
  }
  for (const captionIndex of captionIndices) {
    const candidate = tracks[captionIndex];
    if (candidate && !candidates.includes(candidate)) candidates.push(candidate);
  }
  if (candidates.length === 0) return undefined;

  // Stay within the resolved language, but still prefer a manual track inside it.
  const first = candidates[0];
  if (!first) return undefined;
  const sameLanguage = candidates.filter(
    (candidate) => candidate.languageCode === first.languageCode,
  );
  const track = preferManual(sameLanguage) ?? first;

  return { track, reason: { kind: 'audio-track-default', languageCode: track.languageCode } };
}

function fromDefaultAudioLanguage(
  tracks: CaptionTrack[],
  audio: AudioTrackInfo,
): TrackSelection | undefined {
  const language = audio.defaultAudioLanguage;
  if (!language) return undefined;

  const matches = tracksForLanguage(tracks, language);
  const track = preferManual(matches);
  if (!track) return undefined;

  return { track, reason: { kind: 'default-audio-language', languageCode: track.languageCode } };
}

/**
 * Chooses the caption track in the video's original spoken language.
 *
 * Fallback chain, in order (SPEC 1.3): default audio track, then a
 * defaultAudioLanguage field, then the first manual track, then the first track.
 */
export function selectOriginalTrack(
  tracks: CaptionTrack[],
  audio: AudioTrackInfo,
): Result<TrackSelection, ExtractionError> {
  if (tracks.length === 0) {
    return err(extractionError('no-caption-tracks'));
  }

  const byAudioTrack = fromAudioTracks(tracks, audio);
  if (byAudioTrack) return ok(byAudioTrack);

  const byLanguage = fromDefaultAudioLanguage(tracks, audio);
  if (byLanguage) return ok(byLanguage);

  const manual = tracks.find((track) => !isAsr(track));
  if (manual) return ok({ track: manual, reason: { kind: 'first-manual' } });

  const first = tracks[0];
  if (!first) return err(extractionError('no-caption-tracks'));

  return ok({ track: first, reason: { kind: 'first-available' } });
}
