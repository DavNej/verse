/**
 * Caption download (SPEC 1.4).
 *
 * json3 is requested explicitly: it avoids XML parsing and HTML entity unescaping.
 */

import { type PoToken, withPoToken } from '../core/poToken';
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

/**
 * Downloads and validates one caption track.
 *
 * Without a proof-of-origin token YouTube answers with an empty body, so the
 * request is still made — it costs nothing if YouTube stops asking — but an empty
 * answer is then reported as the missing token rather than as an empty track.
 */
export async function fetchTranscript(
  track: CaptionTrack,
  token: PoToken | null,
): Promise<Result<TranscriptSegment[], ExtractionError>> {
  const url = json3Url(token ? withPoToken(track.baseUrl, token) : track.baseUrl);

  let response: Response;
  try {
    response = await fetch(url, { credentials: 'include' });
  } catch (cause) {
    return err(extractionError('network', { detail: String(cause) }));
  }

  if (response.status === 429) return err(extractionError('rate-limited'));
  if (!response.ok) {
    return err(extractionError('network', { detail: `HTTP ${response.status}` }));
  }

  const body = (await response.text()).trim();
  if (body.length === 0) return err(extractionError(token ? 'empty-track' : 'missing-po-token'));
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
