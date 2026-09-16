/**
 * Retrieval of ytInitialPlayerResponse (SPEC 1.2).
 *
 * Three strategies are tried in order. The inline one is instant but goes stale
 * across SPA navigation, so it is only trusted when the document it came from is
 * the document for the video being asked about.
 */

import { safeParsePlayerResponse } from '../core/schemas/playerResponse';
import {
  type ExtractionError,
  err,
  extractionError,
  type PlayerContext,
  type Result,
} from '../core/types';
import { videoIdFromUrl } from './navigation';

const PLAYER_RESPONSE_ASSIGNMENT = /ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;/s;

function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/** Pulls the assignment out of a blob of HTML or script text. */
function matchPlayerResponse(source: string): unknown {
  const match = source.match(PLAYER_RESPONSE_ASSIGNMENT);
  if (!match?.[1]) return undefined;
  try {
    return JSON.parse(match[1]);
  } catch {
    // The greedy-but-lazy match can stop early on a nested '};'. Widen once.
    const start = source.indexOf(match[1]);
    const widened = source.slice(start);
    return parseLeadingObject(widened);
  }
}

/** Reads one JSON object from the start of `source`, ignoring whatever follows. */
function parseLeadingObject(source: string): unknown {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === '{') depth++;
    if (char === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(source.slice(0, i + 1));
        } catch {
          return undefined;
        }
      }
    }
  }
  return undefined;
}

/**
 * Strategy 1 — the live document.
 *
 * Rejected unless the document's own URL still points at the requested video:
 * after an SPA navigation the inline script belongs to whichever video was loaded
 * first, and trusting it is exactly the bug SPEC 0.8 warns about.
 */
function fromLiveDocument(videoId: string): unknown {
  if (videoIdFromUrl(window.location.href) !== videoId) return undefined;

  for (const script of Array.from(document.querySelectorAll('script'))) {
    const text = script.textContent;
    if (!text?.includes('ytInitialPlayerResponse')) continue;
    const parsed = matchPlayerResponse(text);
    if (parsed) return parsed;
  }
  return undefined;
}

/**
 * Strategy 2 — refetch the watch page.
 *
 * Same-origin from the content script, so it carries the user's cookies and needs
 * neither an API key nor main-world injection. This is the normal SPA path.
 */
async function fromWatchPage(videoId: string): Promise<Result<unknown, ExtractionError>> {
  let response: Response;
  try {
    response = await fetch(watchUrl(videoId), { credentials: 'include' });
  } catch (cause) {
    return err(extractionError('network', { detail: String(cause) }));
  }

  if (response.status === 429) return err(extractionError('rate-limited'));
  if (!response.ok) {
    return err(extractionError('network', { detail: `HTTP ${response.status}` }));
  }

  const html = await response.text();
  if (html.includes('consent.youtube.com') && !html.includes('ytInitialPlayerResponse')) {
    return err(extractionError('consent-wall'));
  }

  const parsed = matchPlayerResponse(html);
  return parsed ? { ok: true, value: parsed } : err(extractionError('no-player-response'));
}

/**
 * Strategy 3 — the youtubei /player endpoint.
 *
 * Last resort, and the most likely of the three to rot: it speaks an undocumented
 * internal API. If it stops working, strategy 2 is the one worth repairing.
 */
async function fromPlayerEndpoint(videoId: string): Promise<Result<unknown, ExtractionError>> {
  const body = {
    videoId,
    context: {
      client: { clientName: 'WEB', clientVersion: '2.20240101.00.00', hl: 'en' },
    },
  };

  try {
    const response = await fetch('https://www.youtube.com/youtubei/v1/player', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (response.status === 429) return err(extractionError('rate-limited'));
    if (!response.ok) {
      return err(extractionError('network', { detail: `HTTP ${response.status}` }));
    }
    return { ok: true, value: await response.json() };
  } catch (cause) {
    return err(extractionError('network', { detail: String(cause) }));
  }
}

/**
 * Returns a validated player context for `videoId`.
 *
 * Each strategy is tried until one yields a response that parses. A parse failure
 * is reported with the path that moved rather than retried, because a schema
 * mismatch will fail identically on the next strategy.
 */
export async function getPlayerContext(
  videoId: string,
): Promise<Result<PlayerContext, ExtractionError>> {
  const inline = fromLiveDocument(videoId);
  if (inline) return safeParsePlayerResponse(inline, videoId);

  const watchPage = await fromWatchPage(videoId);
  if (watchPage.ok) return safeParsePlayerResponse(watchPage.value, videoId);
  // A rate limit or a consent wall will not improve on the next strategy.
  if (watchPage.error.kind !== 'no-player-response') return err(watchPage.error);

  const endpoint = await fromPlayerEndpoint(videoId);
  if (!endpoint.ok) return err(endpoint.error);

  return safeParsePlayerResponse(endpoint.value, videoId);
}
