/**
 * Domain types for Verse.
 *
 * This module — like everything under src/core/ — is environment-agnostic: no DOM,
 * no chrome.*, no React. It describes data, not how the data was obtained.
 */

/** Typed success/failure. Errors are values here, never thrown. */
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

export type ExtractionErrorKind =
  /** Could not find or fetch ytInitialPlayerResponse. */
  | 'no-player-response'
  /** A Zod schema stopped matching. `path` says which field moved. */
  | 'schema-mismatch'
  /** The video has no captions at all. */
  | 'no-caption-tracks'
  /** A track was listed, but downloading it produced no events. */
  | 'empty-track'
  /** The track came back empty and no proof-of-origin token could be obtained for it. */
  | 'missing-po-token'
  /** HTML came back instead of JSON — usually a consent interstitial. */
  | 'consent-wall'
  /** HTTP 429. */
  | 'rate-limited'
  /** The request failed outright. */
  | 'network'
  /** Live streams have no stable transcript. */
  | 'live-stream'
  /** Age-gated, private, or otherwise unplayable. */
  | 'restricted-video'
  /** The active tab is not a YouTube /watch page. */
  | 'not-a-watch-page';

export type ExtractionError = {
  kind: ExtractionErrorKind;
  /** Free-form context for the console. Never shown verbatim to the user. */
  detail?: string;
  /** For 'schema-mismatch': the dotted path of the field that failed. */
  path?: string;
};

export function extractionError(
  kind: ExtractionErrorKind,
  extra?: { detail?: string; path?: string },
): ExtractionError {
  return { kind, ...extra };
}

/** One caption track as offered by the player response. */
export type CaptionTrack = {
  /** Already stripped of any translation parameter. Use verbatim. */
  baseUrl: string;
  languageCode: string;
  /** Human-readable track name, e.g. "English (auto-generated)". */
  name: string;
  vssId?: string;
  /** 'asr' marks an auto-generated track. Anything else is a manual track. */
  kind?: string;
};

/** Audio-track metadata used to work out the original spoken language. */
export type AudioTrackInfo = {
  audioTracks: { captionTrackIndices: number[]; defaultCaptionTrackIndex?: number }[];
  defaultAudioTrackIndex?: number;
  /** From videoDetails or microformat, when present. */
  defaultAudioLanguage?: string;
};

/** A single caption cue, before grouping. */
export type TranscriptSegment = {
  startMs: number;
  durationMs: number;
  text: string;
};

/** A readable paragraph of several segments, timestamped by its first segment. */
export type TranscriptBlock = {
  startMs: number;
  text: string;
};

export type VideoMeta = {
  videoId: string;
  title: string;
  channel: string;
  durationSec: number;
  isLive: boolean;
};

export type Transcript = {
  meta: VideoMeta;
  /** Language code of the track actually used. */
  language: string;
  /** True when the track was auto-generated. */
  isAsr: boolean;
  blocks: TranscriptBlock[];
};

/** Everything src/browser/ hands to src/core/ after validation. */
export type PlayerContext = {
  meta: VideoMeta;
  tracks: CaptionTrack[];
  audio: AudioTrackInfo;
};
