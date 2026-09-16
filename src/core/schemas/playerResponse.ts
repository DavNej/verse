/**
 * Zod schemas for ytInitialPlayerResponse.
 *
 * These schemas are deliberately lenient (SPEC 0.6). YouTube adds and moves fields
 * constantly, and an unexpected key must never break extraction. Only the paths we
 * actually read are modelled; everything else passes through untouched.
 */

import { z } from 'zod';
import {
  type AudioTrackInfo,
  type CaptionTrack,
  type ExtractionError,
  err,
  extractionError,
  ok,
  type PlayerContext,
  type Result,
  type VideoMeta,
} from '../types';

/** YouTube renders text either as a flat string or as a runs[] array. */
const textRunsSchema = z
  .object({
    simpleText: z.string().optional(),
    runs: z.array(z.object({ text: z.string().optional() }).loose()).optional(),
  })
  .loose();

const captionTrackSchema = z
  .object({
    baseUrl: z.string().optional(),
    languageCode: z.string().optional(),
    name: textRunsSchema.optional(),
    vssId: z.string().optional(),
    kind: z.string().optional(),
  })
  .loose();

const audioTrackSchema = z
  .object({
    captionTrackIndices: z.array(z.number()).catch([]),
    defaultCaptionTrackIndex: z.number().optional(),
  })
  .loose();

const captionsSchema = z
  .object({
    playerCaptionsTracklistRenderer: z
      .object({
        captionTracks: z.array(captionTrackSchema).optional(),
        audioTracks: z.array(audioTrackSchema).optional(),
        defaultAudioTrackIndex: z.number().optional(),
      })
      .loose()
      .optional(),
  })
  .loose();

const videoDetailsSchema = z
  .object({
    videoId: z.string().optional(),
    title: z.string().optional(),
    author: z.string().optional(),
    lengthSeconds: z.string().optional(),
    isLive: z.boolean().optional(),
    isLiveContent: z.boolean().optional(),
  })
  .loose();

const microformatSchema = z
  .object({
    playerMicroformatRenderer: z
      .object({
        // Path to verify against fixtures — it has moved before.
        defaultAudioLanguage: z.string().optional(),
        lengthSeconds: z.string().optional(),
        ownerChannelName: z.string().optional(),
      })
      .loose()
      .optional(),
  })
  .loose();

export const playerResponseSchema = z
  .object({
    captions: captionsSchema.optional(),
    videoDetails: videoDetailsSchema.optional(),
    microformat: microformatSchema.optional(),
    playabilityStatus: z
      .object({
        status: z.string().optional(),
        reason: z.string().optional(),
      })
      .loose()
      .optional(),
  })
  .loose();

export type PlayerResponse = z.infer<typeof playerResponseSchema>;

function readText(node: z.infer<typeof textRunsSchema> | undefined): string {
  if (!node) return '';
  if (node.simpleText) return node.simpleText;
  return (node.runs ?? []).map((run) => run.text ?? '').join('');
}

/**
 * Removes any translation parameter from a caption URL.
 *
 * YouTube's caption endpoint machine-translates when asked to. Verse never asks
 * (SPEC 0.7). Applying this on the way in means no downstream code can carry one,
 * even if a received URL already had it.
 */
export function stripTranslationParams(url: string): string {
  return url
    .replace(/([?&])tlang=[^&]*&?/g, '$1')
    .replace(/[?&]$/, '')
    .replace(/&&+/g, '&');
}

function toCaptionTracks(raw: z.infer<typeof captionTrackSchema>[]): CaptionTrack[] {
  const tracks: CaptionTrack[] = [];
  for (const entry of raw) {
    // A track without a URL or a language is unusable; drop it rather than fail.
    if (!entry.baseUrl || !entry.languageCode) continue;
    tracks.push({
      baseUrl: stripTranslationParams(entry.baseUrl),
      languageCode: entry.languageCode,
      name: readText(entry.name),
      vssId: entry.vssId,
      kind: entry.kind,
    });
  }
  return tracks;
}

function toVideoMeta(parsed: PlayerResponse, fallbackVideoId: string): VideoMeta {
  const details = parsed.videoDetails;
  const micro = parsed.microformat?.playerMicroformatRenderer;
  const lengthSeconds = details?.lengthSeconds ?? micro?.lengthSeconds ?? '0';
  return {
    videoId: details?.videoId ?? fallbackVideoId,
    title: details?.title ?? 'Untitled',
    channel: details?.author ?? micro?.ownerChannelName ?? 'Unknown channel',
    durationSec: Number.parseInt(lengthSeconds, 10) || 0,
    isLive: details?.isLive ?? false,
  };
}

function toAudioTrackInfo(parsed: PlayerResponse): AudioTrackInfo {
  const renderer = parsed.captions?.playerCaptionsTracklistRenderer;
  return {
    audioTracks: (renderer?.audioTracks ?? []).map((track) => ({
      captionTrackIndices: track.captionTrackIndices,
      defaultCaptionTrackIndex: track.defaultCaptionTrackIndex,
    })),
    defaultAudioTrackIndex: renderer?.defaultAudioTrackIndex,
    defaultAudioLanguage: parsed.microformat?.playerMicroformatRenderer?.defaultAudioLanguage,
  };
}

/**
 * Validates a raw player response and reduces it to the domain object core uses.
 *
 * Never throws: a schema failure is an expected runtime condition, reported with
 * the path of the field that moved so the console says what to fix.
 */
export function safeParsePlayerResponse(
  raw: unknown,
  fallbackVideoId: string,
): Result<PlayerContext, ExtractionError> {
  const parsed = playerResponseSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return err(
      extractionError('schema-mismatch', {
        path: issue ? issue.path.join('.') : undefined,
        detail: issue?.message,
      }),
    );
  }

  const status = parsed.data.playabilityStatus?.status;
  if (status && status !== 'OK') {
    return err(
      extractionError('restricted-video', {
        detail: parsed.data.playabilityStatus?.reason ?? status,
      }),
    );
  }

  const meta = toVideoMeta(parsed.data, fallbackVideoId);
  if (meta.isLive) {
    return err(extractionError('live-stream'));
  }

  const renderer = parsed.data.captions?.playerCaptionsTracklistRenderer;
  const tracks = toCaptionTracks(renderer?.captionTracks ?? []);
  if (tracks.length === 0) {
    return err(extractionError('no-caption-tracks'));
  }

  return ok({ meta, tracks, audio: toAudioTrackInfo(parsed.data) });
}
