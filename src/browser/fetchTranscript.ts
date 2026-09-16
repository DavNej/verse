/**
 * Caption download (SPEC 1.4).
 *
 * json3 is requested explicitly: it avoids XML parsing and HTML entity unescaping.
 */

import { safeParseTimedText } from '../core/schemas/timedText';
import {
  type CaptionTrack,
  type ExtractionError,
  err,
  extractionError,
  type Result,
  type TranscriptSegment,
} from '../core/types';

/**
 * Appends the json3 format to a caption URL.
 *
 * The base URL is used verbatim apart from this: YouTube now signs caption URLs
 * with tokens, and rebuilding one from its parts drops them.
 */
function json3Url(baseUrl: string): string {
  return baseUrl.includes('?') ? `${baseUrl}&fmt=json3` : `${baseUrl}?fmt=json3`;
}

/** Downloads and validates one caption track. */
export async function fetchTranscript(
  track: CaptionTrack,
): Promise<Result<TranscriptSegment[], ExtractionError>> {
  let response: Response;
  try {
    response = await fetch(json3Url(track.baseUrl), { credentials: 'include' });
  } catch (cause) {
    return err(extractionError('network', { detail: String(cause) }));
  }

  if (response.status === 429) return err(extractionError('rate-limited'));
  if (!response.ok) {
    return err(extractionError('network', { detail: `HTTP ${response.status}` }));
  }

  const body = (await response.text()).trim();
  if (body.length === 0) return err(extractionError('empty-track'));
  // An interstitial answers with a page, not with JSON.
  if (body.startsWith('<')) return err(extractionError('consent-wall'));

  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch (cause) {
    return err(extractionError('schema-mismatch', { detail: String(cause) }));
  }

  return safeParseTimedText(raw);
}
