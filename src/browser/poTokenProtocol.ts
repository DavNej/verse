/**
 * The window.postMessage contract between the two content scripts.
 *
 * The main-world script (entrypoints/po-token.content.ts) can see the player's own
 * network requests; the isolated one, which runs the extraction, cannot. Both
 * worlds share the page's `window`, so they talk through it. The page can post on
 * the same channel, which is why every message is namespaced and the receiving
 * side validates it rather than trusting its shape.
 *
 * No Zod import here: this module is bundled into the main-world script, where
 * Zod's code generation would run under YouTube's CSP.
 */

import type { PoToken } from '../core/poToken';

export const MESSAGE_SOURCE = 'verse';

export type PoTokenRequest = {
  source: typeof MESSAGE_SOURCE;
  type: 'po-token-request';
  requestId: string;
  videoId: string;
};

export type PoTokenResponse = {
  source: typeof MESSAGE_SOURCE;
  type: 'po-token-response';
  requestId: string;
  token: PoToken | null;
};

/** How long the main world waits for the player to request captions. */
export const CAPTURE_TIMEOUT_MS = 5000;

/** How long the isolated world waits for any answer at all, capture included. */
export const REQUEST_TIMEOUT_MS = CAPTURE_TIMEOUT_MS + 2000;
