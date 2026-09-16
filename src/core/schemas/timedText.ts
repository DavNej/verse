/**
 * Zod schema for the json3 caption payload.
 *
 * json3 is preferred over the XML format: no XML parsing, no HTML entity
 * unescaping (SPEC 1.4). Same leniency rules as the player response schema.
 */

import { z } from 'zod';
import {
  type ExtractionError,
  err,
  extractionError,
  ok,
  type Result,
  type TranscriptSegment,
} from '../types';

const segmentSchema = z
  .object({
    utf8: z.string().optional(),
  })
  .loose();

const eventSchema = z
  .object({
    tStartMs: z.number().optional(),
    dDurationMs: z.number().optional(),
    segs: z.array(segmentSchema).optional(),
  })
  .loose();

export const timedTextSchema = z
  .object({
    events: z.array(eventSchema).optional(),
  })
  .loose();

/**
 * Validates a json3 payload and flattens it into segments.
 *
 * Events carrying no text at all are dropped: YouTube emits bare timing events as
 * window markers, and they are not part of the transcript.
 */
export function safeParseTimedText(raw: unknown): Result<TranscriptSegment[], ExtractionError> {
  const parsed = timedTextSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return err(
      extractionError('schema-mismatch', {
        path: issue ? issue.path.join('.') : undefined,
        detail: issue?.message,
      }),
    );
  }

  const segments: TranscriptSegment[] = [];
  for (const event of parsed.data.events ?? []) {
    const text = (event.segs ?? []).map((seg) => seg.utf8 ?? '').join('');
    if (text.trim().length === 0) continue;
    segments.push({
      startMs: event.tStartMs ?? 0,
      durationMs: event.dDurationMs ?? 0,
      text,
    });
  }

  if (segments.length === 0) {
    return err(extractionError('empty-track'));
  }

  return ok(segments);
}
