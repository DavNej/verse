/**
 * Asks the main-world script for a caption proof-of-origin token.
 *
 * Runs in the isolated content script. The answer crosses from the page's world,
 * where any script could have posted it, so it is validated like any other input.
 */

import { z } from 'zod';
import type { PoToken } from '../core/poToken';
import { MESSAGE_SOURCE, type PoTokenRequest, REQUEST_TIMEOUT_MS } from './poTokenProtocol';

const poTokenSchema = z.object({
  videoId: z.string().min(1),
  pot: z.string().min(1),
  potc: z.string().optional(),
  c: z.string().optional(),
  cver: z.string().optional(),
});

const responseSchema = z.object({
  source: z.literal(MESSAGE_SOURCE),
  type: z.literal('po-token-response'),
  requestId: z.string(),
  token: poTokenSchema.nullable(),
});

/**
 * Resolves with a token for `videoId`, or null when none could be obtained.
 *
 * Never rejects. Null covers every failure — no main-world script, no player, no
 * caption request within the timeout — because the caller handles them alike.
 */
export function requestPoToken(videoId: string): Promise<PoToken | null> {
  const requestId = crypto.randomUUID();

  return new Promise((resolve) => {
    const finish = (token: PoToken | null) => {
      window.removeEventListener('message', onMessage);
      clearTimeout(timer);
      resolve(token);
    };

    const onMessage = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const parsed = responseSchema.safeParse(event.data);
      if (!parsed.success || parsed.data.requestId !== requestId) return;
      const { token } = parsed.data;
      finish(token && token.videoId === videoId ? token : null);
    };

    const timer = setTimeout(() => finish(null), REQUEST_TIMEOUT_MS);
    window.addEventListener('message', onMessage);

    const request: PoTokenRequest = {
      source: MESSAGE_SOURCE,
      type: 'po-token-request',
      requestId,
      videoId,
    };
    window.postMessage(request, window.location.origin);
  });
}
