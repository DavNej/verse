/**
 * The main-world content script.
 *
 * The isolated content script cannot see the page's network requests, and the
 * player's caption requests carry the token Verse needs (src/browser/poTokenCapture.ts).
 * It starts at document_start so the observer is in place before the player loads.
 */

import { defineContentScript } from 'wxt/utils/define-content-script';
import { startPoTokenCapture } from '../src/browser/poTokenCapture';

export default defineContentScript({
  matches: ['*://*.youtube.com/*'],
  world: 'MAIN',
  runAt: 'document_start',

  main() {
    startPoTokenCapture();
  },
});
