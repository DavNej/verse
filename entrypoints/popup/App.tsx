/**
 * The Verse popup — the whole M1 interface.
 *
 * Opening it starts an extraction on the active tab and shows the detected
 * language; the button then copies the Markdown. Off a video page it explains
 * itself and sends nothing.
 */

import { useCallback, useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import type { ExtractionOutput } from '../../src/browser/extract';
import type { VerseRequest, VerseResponse } from '../../src/browser/messages';
import { videoIdFromUrl } from '../../src/browser/navigation';
import { messageForError, Toast, type ToastTone } from '../../src/components/Toast';
import { VerseButton } from '../../src/components/VerseButton';

type Status =
  | { state: 'loading' }
  | { state: 'ready'; output: ExtractionOutput }
  | { state: 'copied'; output: ExtractionOutput }
  | { state: 'failed'; message: string };

/** Asks the content script on the active tab to extract the current video. */
async function requestExtraction(): Promise<Status> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  const videoId = tab?.url ? videoIdFromUrl(tab.url) : null;

  if (!tab?.id || !videoId) {
    return { state: 'failed', message: messageForError({ kind: 'not-a-watch-page' }) };
  }

  const request: VerseRequest = { type: 'extract', videoId };
  let response: VerseResponse;
  try {
    response = await browser.tabs.sendMessage(tab.id, request);
  } catch {
    // The tab was loaded before Verse was installed or reloaded, so no content
    // script is listening there yet.
    return {
      state: 'failed',
      message: 'Verse is not running on this tab yet. Reload the page and try again.',
    };
  }

  return response.ok
    ? { state: 'ready', output: response.value }
    : { state: 'failed', message: messageForError(response.error) };
}

function TrackSummary({ output }: { output: ExtractionOutput }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="font-medium text-neutral-100 text-sm">{output.language}</span>
      <span className="text-neutral-400 text-xs">
        {output.isAsr ? 'auto-generated' : 'manual captions'}
      </span>
    </div>
  );
}

export function App() {
  const [status, setStatus] = useState<Status>({ state: 'loading' });

  useEffect(() => {
    let active = true;
    requestExtraction().then((next) => {
      if (active) setStatus(next);
    });
    return () => {
      active = false;
    };
  }, []);

  const copy = useCallback(async () => {
    if (status.state !== 'ready' && status.state !== 'copied') return;
    try {
      await navigator.clipboard.writeText(status.output.markdown);
      setStatus({ state: 'copied', output: status.output });
    } catch (cause) {
      setStatus({ state: 'failed', message: `Could not reach the clipboard: ${String(cause)}` });
    }
  }, [status]);

  const output = status.state === 'ready' || status.state === 'copied' ? status.output : null;

  let tone: ToastTone = 'info';
  let message = 'Reading captions…';
  if (status.state === 'failed') {
    tone = 'error';
    message = status.message;
  } else if (status.state === 'copied' && output) {
    tone = 'success';
    message = `Copied ${output.blockCount} blocks in ${output.language}.`;
  } else if (status.state === 'ready' && output) {
    message = `${output.blockCount} blocks ready.`;
  }

  return (
    <main className="flex w-90 flex-col gap-3 bg-neutral-900 p-4 text-neutral-100">
      <header className="flex items-baseline justify-between">
        <h1 className="font-semibold text-base">Verse</h1>
        <span className="text-neutral-500 text-xs">YouTube transcripts</span>
      </header>

      {output && <TrackSummary output={output} />}

      <Toast tone={tone}>{message}</Toast>

      <VerseButton onClick={copy} disabled={!output}>
        {status.state === 'copied' ? 'Copied' : 'Copy Markdown'}
      </VerseButton>
    </main>
  );
}
