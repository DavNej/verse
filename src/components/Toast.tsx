/**
 * The popup's status line.
 *
 * SPEC 1.7 called for an in-page toast; with a popup-only UI the same information
 * belongs here instead. The error messages are mapped from ExtractionErrorKind by
 * an exhaustive switch, so a new error kind fails to compile until it has a
 * message.
 */

import type { ExtractionError, ExtractionErrorKind } from '../core/types';

export type ToastTone = 'info' | 'success' | 'error';

const TONE_CLASSES: Record<ToastTone, string> = {
  info: 'bg-neutral-800 text-neutral-300',
  success: 'bg-emerald-950 text-emerald-300',
  error: 'bg-red-950 text-red-300',
};

/** Plain-language message for each failure mode. */
export function messageForError(error: ExtractionError): string {
  const kind: ExtractionErrorKind = error.kind;
  switch (kind) {
    case 'no-player-response':
      return 'Could not read this page. Reload it and try again.';
    case 'schema-mismatch':
      return `YouTube changed its data format${error.path ? ` (at ${error.path})` : ''}. Verse needs an update.`;
    case 'no-caption-tracks':
      return 'This video has no captions, so there is nothing to extract.';
    case 'empty-track':
      return 'The caption track is listed but came back empty.';
    case 'missing-po-token':
      return 'YouTube withheld the captions. Turn on CC in the player once, then try again.';
    case 'consent-wall':
      return 'YouTube asked for consent instead of returning captions. Accept it on youtube.com, then retry.';
    case 'rate-limited':
      return 'YouTube is rate limiting requests. Wait a minute and try again.';
    case 'network':
      return 'The request failed. Check your connection and try again.';
    case 'live-stream':
      return 'Live streams have no fixed transcript.';
    case 'restricted-video':
      return 'This video is restricted, so its captions are not available.';
    case 'not-a-watch-page':
      return 'Open a YouTube video, then click Verse.';
    default: {
      // Exhaustiveness: adding an error kind without a message is a type error.
      const unhandled: never = kind;
      return unhandled;
    }
  }
}

export function Toast({ tone, children }: { tone: ToastTone; children: string }) {
  return (
    <p className={`rounded-lg px-3 py-2 text-sm leading-snug ${TONE_CLASSES[tone]}`}>{children}</p>
  );
}
