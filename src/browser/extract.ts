/**
 * The extraction pipeline (SPEC 1.1).
 *
 * Steps 1 and 3 are here in src/browser/; steps 2, 4 and 5 are pure functions from
 * src/core/. This module only wires them together and logs the decision.
 */

import { toMarkdown } from '../core/format';
import { cleanSegments, deduplicateAsr, groupSegments } from '../core/normalize';
import { selectOriginalTrack } from '../core/trackSelector';
import { type ExtractionError, err, ok, type Result, type Transcript } from '../core/types';
import { fetchTranscript } from './fetchTranscript';
import { getPlayerContext } from './playerResponse';
import { requestPoToken } from './poToken';

export type ExtractionOutput = {
  markdown: string;
  language: string;
  trackName: string;
  isAsr: boolean;
  blockCount: number;
};

/**
 * Runs the whole pipeline for one video.
 *
 * Logs which track was chosen and why, never the transcript itself (SPEC 0.7).
 */
export async function extract(videoId: string): Promise<Result<ExtractionOutput, ExtractionError>> {
  const context = await getPlayerContext(videoId);
  if (!context.ok) return err(context.error);

  const selection = selectOriginalTrack(context.value.tracks, context.value.audio);
  if (!selection.ok) return err(selection.error);

  const { track, reason } = selection.value;
  const isAsr = track.kind === 'asr';
  console.info(
    `[Verse] track: ${track.languageCode} (${isAsr ? 'auto-generated' : 'manual'}), reason: ${reason.kind}`,
  );

  // Logged as present or absent only: the token is a credential.
  const token = await requestPoToken(videoId);
  console.info(`[Verse] caption token: ${token ? 'captured' : 'missing'}`);

  const segments = await fetchTranscript(track, token);
  if (!segments.ok) return err(segments.error);

  const normalized = isAsr ? deduplicateAsr(segments.value) : cleanSegments(segments.value);
  const blocks = groupSegments(normalized);

  const transcript: Transcript = {
    meta: context.value.meta,
    language: track.languageCode,
    isAsr,
    blocks,
  };

  return ok({
    markdown: toMarkdown(transcript),
    language: track.languageCode,
    trackName: track.name,
    isAsr,
    blockCount: blocks.length,
  });
}
