/**
 * Markdown rendering (SPEC 1.6).
 *
 * Output is meant for pasting into an LLM prompt or an Obsidian note, so the header
 * carries the provenance and every block is a clickable seek link.
 */

import type { Transcript } from './types';

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

/** [MM:SS], or [HH:MM:SS] once the video passes an hour. */
export function formatTimestamp(totalMs: number): string {
  const totalSeconds = Math.floor(totalMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

/** Human-readable duration for the header. */
function formatDuration(totalSec: number): string {
  return formatTimestamp(totalSec * 1000);
}

export function videoUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/** Deep link that seeks to a given moment. */
export function timestampUrl(videoId: string, startMs: number): string {
  return `${videoUrl(videoId)}&t=${Math.floor(startMs / 1000)}s`;
}

/**
 * Renders a transcript as Markdown.
 *
 * `extractedAt` is injected rather than read from the clock so the output is
 * deterministic in tests — and so core stays free of ambient state.
 */
export function toMarkdown(transcript: Transcript, extractedAt: Date = new Date()): string {
  const { meta, language, isAsr, blocks } = transcript;
  const lines: string[] = [];

  lines.push(`# ${meta.title}`);
  lines.push('');
  lines.push(`- **Channel:** ${meta.channel}`);
  lines.push(`- **URL:** ${videoUrl(meta.videoId)}`);
  lines.push(`- **Duration:** ${formatDuration(meta.durationSec)}`);
  lines.push(`- **Language:** ${language}${isAsr ? ' (auto-generated captions)' : ''}`);
  lines.push(`- **Extracted:** ${extractedAt.toISOString().slice(0, 10)}`);
  if (isAsr) {
    lines.push('');
    lines.push('> Captions are auto-generated. Wording and punctuation may be imprecise.');
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const block of blocks) {
    const stamp = formatTimestamp(block.startMs);
    lines.push(`**[${stamp}](${timestampUrl(meta.videoId, block.startMs)})** ${block.text}`);
    lines.push('');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}
