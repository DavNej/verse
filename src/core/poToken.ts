/**
 * Proof-of-origin tokens for caption URLs.
 *
 * YouTube answers a caption request with an empty body unless it carries a `pot`
 * token, and the player response's caption URLs do not. The player mints one when
 * it loads captions itself, so src/browser/ reads it off the player's own request
 * and these helpers move it onto the URL Verse fetches.
 *
 * Plain string handling on purpose: the URL class is a DOM/Node global, and
 * src/core/ compiles without either.
 */

/** The token and the client identity it was minted for, bound to one video. */
export type PoToken = {
  videoId: string;
  pot: string;
  potc?: string;
  /** Client name, e.g. "WEB". */
  c?: string;
  /** Client version. */
  cver?: string;
};

/** Every parameter a PoToken carries onto a caption URL, in the order appended. */
const TOKEN_PARAMS = ['pot', 'potc', 'c', 'cver'] as const;

const TIMEDTEXT_ENDPOINT = /^https?:\/\/(?:[\w-]+\.)*youtube\.com\/api\/timedtext$/;

type SplitUrl = { path: string; segments: string[] };

/** Separates a URL into what precedes the query and its raw `key=value` segments. */
function splitUrl(url: string): SplitUrl {
  const hashAt = url.indexOf('#');
  const withoutHash = hashAt === -1 ? url : url.slice(0, hashAt);
  const queryAt = withoutHash.indexOf('?');
  if (queryAt === -1) return { path: withoutHash, segments: [] };
  return {
    path: withoutHash.slice(0, queryAt),
    segments: withoutHash
      .slice(queryAt + 1)
      .split('&')
      .filter((segment) => segment.length > 0),
  };
}

function decode(part: string): string {
  try {
    return decodeURIComponent(part.replace(/\+/g, ' '));
  } catch {
    return part;
  }
}

function keyOf(segment: string): string {
  const eq = segment.indexOf('=');
  return decode(eq === -1 ? segment : segment.slice(0, eq));
}

/** First value of each parameter, decoded. */
function readParams(segments: string[]): Map<string, string> {
  const params = new Map<string, string>();
  for (const segment of segments) {
    const key = keyOf(segment);
    if (params.has(key)) continue;
    const eq = segment.indexOf('=');
    params.set(key, eq === -1 ? '' : decode(segment.slice(eq + 1)));
  }
  return params;
}

/**
 * Reads a PoToken from a timedtext request URL, or null if it carries none.
 *
 * Only YouTube's own caption endpoint qualifies, and only with both a video ID and
 * a non-empty token: a token is useless without knowing which video it is for.
 */
export function readPoToken(url: string): PoToken | null {
  const { path, segments } = splitUrl(url);
  if (!TIMEDTEXT_ENDPOINT.test(path)) return null;

  const params = readParams(segments);
  const videoId = params.get('v');
  const pot = params.get('pot');
  if (!videoId || !pot) return null;

  const token: PoToken = { videoId, pot };
  for (const key of ['potc', 'c', 'cver'] as const) {
    const value = params.get(key);
    if (value) token[key] = value;
  }
  return token;
}

/**
 * Appends a PoToken to a caption URL.
 *
 * Every other parameter is kept byte for byte, because the URL is signed. Any
 * token parameter already present is replaced rather than duplicated. A token
 * minted for a different video is not applied: the URL is returned unchanged and
 * the download fails the way it would have without one.
 */
export function withPoToken(url: string, token: PoToken): string {
  const { path, segments } = splitUrl(url);
  if (readParams(segments).get('v') !== token.videoId) return url;

  const replaced = new Set<string>(TOKEN_PARAMS);
  const kept = segments.filter((segment) => !replaced.has(keyOf(segment)));
  const added = TOKEN_PARAMS.flatMap((key) => {
    const value = token[key];
    return value ? [`${key}=${encodeURIComponent(value)}`] : [];
  });

  return `${path}?${[...kept, ...added].join('&')}`;
}
