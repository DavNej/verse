/**
 * Caption token capture — runs in the page's main world.
 *
 * YouTube only serves caption bodies to requests carrying a proof-of-origin `pot`
 * token, which the player mints for its own caption requests. This module watches
 * those requests, keeps the latest token per video, and hands it to the isolated
 * content script on request (see poTokenProtocol.ts).
 *
 * Requests are observed through Resource Timing rather than by patching fetch and
 * XMLHttpRequest: it sees both transports, cannot break the page's own calls, and
 * its buffer covers requests the player made before this script ran.
 *
 * When no token has been seen for a video yet, captions are switched on through
 * the player for as long as it takes the player to fetch them, then switched back.
 */

import { type PoToken, readPoToken } from '../core/poToken';
import {
  CAPTURE_TIMEOUT_MS,
  MESSAGE_SOURCE,
  type PoTokenRequest,
  type PoTokenResponse,
} from './poTokenProtocol';

/** Latest token seen, by video ID. */
const tokens = new Map<string, PoToken>();

/** Callbacks waiting for the next token to be recorded. */
const waiters = new Set<(token: PoToken) => void>();

/** Captures in progress, by video ID, so concurrent requests toggle captions once. */
const inFlight = new Map<string, Promise<PoToken | null>>();

function record(url: string): void {
  const token = readPoToken(url);
  if (!token) return;
  tokens.set(token.videoId, token);
  for (const waiter of waiters) waiter(token);
}

/** Resolves with the next token recorded for `videoId`, or null after the timeout. */
function waitForToken(videoId: string, timeoutMs: number): Promise<PoToken | null> {
  return new Promise((resolve) => {
    const finish = (token: PoToken | null) => {
      waiters.delete(waiter);
      clearTimeout(timer);
      resolve(token);
    };
    const waiter = (token: PoToken) => {
      if (token.videoId === videoId) finish(token);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    waiters.add(waiter);
  });
}

type Method = (...args: unknown[]) => unknown;

/** A method of a page object, if it has one. The player's API is undocumented. */
function methodOf(target: object, name: string): Method | null {
  const value: unknown = Reflect.get(target, name);
  return typeof value === 'function' ? (value as Method).bind(target) : null;
}

/** The ID of the video a player element is currently showing. */
function playerVideoId(player: HTMLElement): string | null {
  const data = methodOf(player, 'getVideoData')?.();
  if (typeof data !== 'object' || data === null) return null;
  const id: unknown = Reflect.get(data, 'video_id');
  return typeof id === 'string' ? id : null;
}

/** The player element showing `videoId`: the watch player, or the Shorts one. */
function findPlayer(videoId: string): HTMLElement | null {
  for (const id of ['movie_player', 'shorts-player']) {
    const player = document.getElementById(id);
    if (player && playerVideoId(player) === videoId) return player;
  }
  return null;
}

/** The player's own CC button, which reflects its caption state. */
function subtitlesButton(player: HTMLElement): HTMLElement | null {
  return player.querySelector<HTMLElement>('.ytp-subtitles-button');
}

/** Whether captions are on, or null when the player gives no way to tell. */
function captionsOn(player: HTMLElement): boolean | null {
  const isOn = methodOf(player, 'isSubtitlesOn')?.();
  if (typeof isOn === 'boolean') return isOn;
  const pressed = subtitlesButton(player)?.getAttribute('aria-pressed');
  if (pressed === 'true') return true;
  if (pressed === 'false') return false;
  return null;
}

/**
 * Flips captions to `on`. Prefers the explicit API, then the toggle, then the CC
 * button — whichever this player build exposes. Returns false if none did.
 */
function setCaptions(player: HTMLElement, on: boolean): boolean {
  const explicit = methodOf(player, on ? 'toggleSubtitlesOn' : 'toggleSubtitlesOff');
  if (explicit) {
    explicit();
    return true;
  }
  const toggle = methodOf(player, 'toggleSubtitles');
  if (toggle) {
    toggle();
    return true;
  }
  const button = subtitlesButton(player);
  if (button) {
    button.click();
    return true;
  }
  return false;
}

/**
 * Makes the player request captions for `videoId` and captures the token.
 *
 * Captions are only switched on when they are known to be off, and switched back
 * off afterwards whatever the outcome. When they are already on, the player's
 * request is either already recorded or in flight, so this only waits.
 */
async function captureToken(videoId: string): Promise<PoToken | null> {
  const player = findPlayer(videoId);
  if (!player) return null;

  const wasOn = captionsOn(player);
  if (wasOn !== false) return waitForToken(videoId, CAPTURE_TIMEOUT_MS);

  const captured = waitForToken(videoId, CAPTURE_TIMEOUT_MS);
  if (!setCaptions(player, true)) return null;
  try {
    return await captured;
  } finally {
    setCaptions(player, false);
  }
}

function tokenFor(videoId: string): Promise<PoToken | null> {
  const known = tokens.get(videoId);
  if (known) return Promise.resolve(known);

  const pending = inFlight.get(videoId);
  if (pending) return pending;

  const capture = captureToken(videoId).finally(() => inFlight.delete(videoId));
  inFlight.set(videoId, capture);
  return capture;
}

function isPoTokenRequest(data: unknown): data is PoTokenRequest {
  if (typeof data !== 'object' || data === null) return false;
  return (
    Reflect.get(data, 'source') === MESSAGE_SOURCE &&
    Reflect.get(data, 'type') === 'po-token-request' &&
    typeof Reflect.get(data, 'requestId') === 'string' &&
    typeof Reflect.get(data, 'videoId') === 'string'
  );
}

/** Starts watching caption requests and answering token requests. */
export function startPoTokenCapture(): void {
  // Requests made before this script ran; the observer below only delivers
  // buffered entries asynchronously.
  for (const entry of performance.getEntriesByType('resource')) record(entry.name);

  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) record(entry.name);
  }).observe({ type: 'resource', buffered: true });

  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const data: unknown = event.data;
    if (!isPoTokenRequest(data)) return;

    void tokenFor(data.videoId).then((token) => {
      const response: PoTokenResponse = {
        source: MESSAGE_SOURCE,
        type: 'po-token-response',
        requestId: data.requestId,
        token,
      };
      window.postMessage(response, window.location.origin);
    });
  });
}
