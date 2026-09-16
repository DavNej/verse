/**
 * The content script — headless.
 *
 * Verse injects no UI: the popup is the whole interface. This script exists only
 * because reading the page and fetching captions must happen on youtube.com's own
 * origin. It renders nothing, so it cannot break the host page.
 */

import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { type ExtractionOutput, extract } from '../../src/browser/extract';
import type { VerseRequest, VerseResponse } from '../../src/browser/messages';

export default defineContentScript({
  matches: ['*://*.youtube.com/*'],

  main() {
    /**
     * Last successful extraction, by video ID.
     *
     * Keying on the ID means an SPA navigation invalidates the cache implicitly:
     * the next request asks about a different video and misses.
     */
    const cache = new Map<string, ExtractionOutput>();

    browser.runtime.onMessage.addListener(
      (message: unknown, _sender, sendResponse: (response: VerseResponse) => void) => {
        const request = message as VerseRequest;
        if (request?.type !== 'extract') return false;

        const cached = cache.get(request.videoId);
        if (cached) {
          sendResponse({ ok: true, value: cached });
          return false;
        }

        extract(request.videoId)
          .then((result) => {
            if (result.ok) cache.set(request.videoId, result.value);
            sendResponse(result);
          })
          .catch((cause: unknown) => {
            // Nothing above should throw, but a rejected promise here would leave
            // the popup waiting forever.
            console.warn('[Verse] extraction threw', cause);
            sendResponse({ ok: false, error: { kind: 'network', detail: String(cause) } });
          });

        // Keeps the message channel open for the async response.
        return true;
      },
    );
  },
});
