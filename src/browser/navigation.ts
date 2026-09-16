/**
 * SPA navigation helpers.
 *
 * YouTube never reloads the page between videos, and the classic bug in this kind
 * of extension is extracting the previous video's transcript (SPEC 0.8). Extraction
 * runs on demand from the popup, so the defence is simply to read the video ID at
 * request time and to reject a document that disagrees with it.
 */

/** The `v` parameter of the current URL, or null off a /watch page. */
export function getCurrentVideoId(): string | null {
  return videoIdFromUrl(window.location.href);
}

/** The `v` parameter of any YouTube watch URL. */
export function videoIdFromUrl(href: string): string | null {
  try {
    const url = new URL(href);
    // Exact host or a subdomain of it — 'notyoutube.com' must not pass.
    const host = url.hostname;
    if (host !== 'youtube.com' && !host.endsWith('.youtube.com')) return null;
    if (url.pathname === '/watch') return url.searchParams.get('v');
    // Shorts carry the ID in the path instead.
    const shortsMatch = url.pathname.match(/^\/shorts\/([\w-]+)/);
    return shortsMatch?.[1] ?? null;
  } catch {
    return null;
  }
}

export function isWatchUrl(href: string): boolean {
  return videoIdFromUrl(href) !== null;
}
