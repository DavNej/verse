> This file is the project specification. It is meant to be read by a coding agent at the start of every session. Keep it at the repository root and update it when decisions change.

# Verse — YouTube Timestamped Transcript Extension

Specification document intended to be handed to a coding agent.
Personal project, single user, not intended for Chrome Web Store publication.

**Project name:** Verse. Package name, repository name and root folder: `verse`. Manifest display name: `Verse`.

**How to use this document:** Part 0 is shared context and applies to every milestone — read it first, always. Parts 1 through 3 are self-contained milestones. Build one milestone at a time. Do not start a milestone before the previous one is working and has been used against real videos.

---

# Part 0 — Shared context

## 0.1 Goal

Extract a YouTube video's transcript **in its original spoken language**, with **timestamps**, formatted for pasting into an LLM or into Obsidian.

## 0.2 Global success criteria

1. On any `/watch` page with captions available, one click produces clean timestamped Markdown.
2. The language returned is the one actually spoken in the video — **never a machine translation**.
3. Auto-caption repetition is eliminated.
4. Text is grouped into readable blocks, not two-second fragments.
5. Video chapters are included when they exist (M2+).

## 0.3 Non-goals — do not implement

- No summarization, no LLM API calls. Verse produces text, nothing else.
- No audio transcription (Whisper or equivalent) for videos without captions.
- No playlist or batch processing.
- No user accounts, no backend, no telemetry, no analytics.
- No translation features of any kind.

## 0.4 Stack

| Concern | Choice | Notes |
|---|---|---|
| Language | **TypeScript**, `strict: true` | `noUncheckedIndexedAccess` also on |
| Extension framework | **WXT** | Vite-based, file-based entrypoints, generates the manifest |
| UI | **React 19** | Everywhere, including the in-page injected UI |
| Styling | **Tailwind** | See the Shadow DOM caveat in 0.8 |
| Runtime validation | **Zod** | Mandatory at every external data boundary |
| Tests | **Vitest** | WXT provides a Vitest plugin with a fake browser environment |
| Package manager | **pnpm** | |
| Lint / format | **Biome** | Single tool, minimal config. Swap for ESLint + Prettier if preferred |

Target Chrome/Chromium (Brave, Edge, Arc). WXT supports Firefox builds; do not configure that unless asked.

Minimal permissions: `activeTab`, `clipboardWrite`, `storage`. Host permissions limited to `*://*.youtube.com/*`.

**Disable WXT auto-imports** (`imports: false` in `wxt.config.ts`). Use explicit imports everywhere. This keeps `src/core/` genuinely portable and makes the code legible when read out of context.

## 0.5 Architecture

Critical constraint: **the core logic must be environment-agnostic.**

Modules under `src/core/` must not import `wxt/browser`, must not reference `chrome.*`, `document`, or `window`, and must not import React. They take data in and return data out. The purpose is to allow this core to be reused as-is inside an Obsidian plugin later — Obsidian plugins are TypeScript, so this portability is real rather than theoretical.

Enforce this mechanically: a lint rule (Biome `noRestrictedImports`, or a dedicated `tsconfig` for the core with a DOM-free `lib`) that fails the build if `src/core/` reaches for browser globals.

Create the full structure at M1 even though M2 and M3 files stay empty.

```
verse/
├── wxt.config.ts
├── tsconfig.json
├── SPEC.md                          ← this document
├── entrypoints/
│   ├── content/
│   │   └── index.ts                 ← M1 — headless content script, message handler only
│   ├── popup/                       ← M1 — the whole M1 UI (see 1.7)
│   │   ├── index.html
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   └── style.css
│   └── options/                     ← M2
│       ├── index.html
│       └── main.tsx
├── src/
│   ├── core/                        ← pure TS. No DOM, no chrome.*, no React.
│   │   ├── schemas/
│   │   │   ├── playerResponse.ts    ← M1 — Zod schemas for ytInitialPlayerResponse
│   │   │   └── timedText.ts         ← M1 — Zod schema for the json3 caption payload
│   │   ├── types.ts                 ← M1 — domain types + Result/error unions
│   │   ├── trackSelector.ts         ← M1 — caption track selection
│   │   ├── normalize.ts             ← M1 — deduplication + grouping
│   │   ├── format.ts                ← M1 — Markdown / plain text / SRT rendering
│   │   └── chapters.ts              ← M2 — chapter extraction
│   ├── browser/                     ← the only place allowed to touch the page or network
│   │   ├── playerResponse.ts        ← M1 — pull the JSON out of the page
│   │   ├── fetchTranscript.ts       ← M1 — network calls
│   │   └── navigation.ts            ← M1 — SPA navigation detection
│   ├── components/                  ← React components shared across entrypoints
│   │   ├── VerseButton.tsx          ← M1
│   │   └── Toast.tsx                ← M1
│   ├── storage/                     ← M2 — typed settings wrapper over WXT storage
│   └── integrations/
│       └── obsidian.ts              ← M3
└── test/
    └── fixtures/                    ← captured player responses, as .json
```

## 0.6 Validation strategy — how Zod is used here

This is the part of the stack that matters most for this specific project.

`ytInitialPlayerResponse` is undocumented, unstable, and not under our control. Treating it as a typed object without validation is how this category of extension breaks silently.

**Rules:**

1. **Never `.parse()` YouTube data. Always `.safeParse()`.** A schema failure is an expected runtime condition, not an exception.
2. **Schemas are deliberately lenient.** Almost every field is `.optional()`. Use `.catch()` to supply fallbacks rather than failing the whole parse over one unexpected field. Objects are loose (unknown keys pass through) — YouTube adds fields constantly and that must never break us.
3. **Validate at the boundary, then trust.** `src/browser/` parses and returns typed domain objects. `src/core/` receives already-validated types and does no defensive checking.
4. **Schema failures are logged with the failing path.** When YouTube changes a structure, the console should say which field moved. This is the diagnostic surface for the whole project.
5. **Do not model the whole player response.** Model only the paths actually used — captions, audio tracks, video details, and (at M2) chapter markers. Everything else is ignored.

**Error handling is typed, not thrown.** Define a discriminated union in `src/core/types.ts` covering the failure modes, and have the extraction pipeline return a `Result<Transcript, ExtractionError>`. The UI maps each error kind to a message. No `try/catch` sprawl, no string error messages floating around.

The error kinds to cover, at minimum: no caption tracks, track listed but download empty, rate limited, consent wall (HTML instead of JSON), player response not found, schema mismatch, live stream, restricted video.

## 0.7 Cross-cutting rules

These apply to every milestone and are non-negotiable.

**Never add a translation parameter to a caption track URL.** YouTube's caption endpoint accepts a `tlang` parameter that triggers server-side machine translation. It must not appear anywhere in the codebase. If a received URL already contains one, strip it. This is the requirement most likely to be violated by accident, because it looks like a helpful feature.

**Never break the host page.** If a DOM anchor is missing or an API shape is unexpected, degrade quietly and log. A failed extraction is acceptable; a broken YouTube page is not.

**Log the decisions, not the data.** Every extraction logs which track was selected, whether it is ASR or manual, and why it was chosen.

**No `any` in `src/core/`.** `unknown` plus a Zod schema is the pattern.

## 0.8 Known pitfalls — read before writing any code

- **ASR overlap deduplication is the make-or-break component.** A poorly deduplicated transcript is unusable downstream. Give it the care it needs and test it first.
- **YouTube is a SPA.** It does not reload the page between videos. The most common bug in this category of extension is extracting the transcript of the *previous* video. Invalidate all state on navigation.
- **Tailwind inside a Shadow DOM needs explicit handling.** Styles must be injected into the shadow root, not the document — use WXT's `cssInjectionMode: 'ui'`. And **disable Tailwind preflight**, or scope it: the global reset will otherwise leak assumptions into a root that sits inside YouTube's own page. Verify the button renders correctly in both YouTube themes before moving on.
- **Dubbed videos** expose multiple audio tracks. This is where original-language selection most easily goes wrong.
- **Player response field paths are not stable.** This is what the Zod layer exists for. When a schema stops matching, the fix is to update the schema, not to add optional chaining.
- These are **undocumented internal APIs**. Degrade gracefully rather than failing hard.

---

# Part 1 — Milestone M1: Working core

**Scope:** Everything needed for Verse to be genuinely useful day to day, and nothing more.

**Deliverable:** On a `/watch` page, a button appears below the player. Clicking it copies a clean timestamped Markdown transcript in the video's original language to the clipboard, and shows a toast.

**Explicitly not in M1:** no options page, no chapters, no track selector, no plain-text or SRT output, no file download, no Obsidian integration, no settings persistence. Create the folders, leave those files empty.

## 1.1 Pipeline

```
/watch page
   │
   ├─► [1] Retrieve and validate ytInitialPlayerResponse
   ├─► [2] Select caption track (original language)
   ├─► [3] Download and validate track as json3
   ├─► [4] Normalize: deduplicate, then group
   └─► [5] Render Markdown → clipboard
```

Steps 1 and 3 live in `src/browser/`. Steps 2, 4 and 5 live in `src/core/` and are pure functions.

## 1.2 Step 1 — Retrieve the player response

From a content script the JSON is already in the page. Try in order:

1. Parse the document's `<script>` tag contents for `ytInitialPlayerResponse = {...}`.
2. If absent (SPA navigation — the page was never reloaded), call the `youtubei` `/player` endpoint with the current video ID.

Feed the result through `safeParse`. Return a typed `PlayerContext` or an `ExtractionError`.

**SPA handling is required in M1, not deferred.** `src/browser/navigation.ts` detects URL changes (the `yt-navigate-finish` event, a `MutationObserver` on the title, or polling `location.href`) and invalidates state. The React UI should remount or reset on video change.

## 1.3 Step 2 — Track selection

Tracks live under `captions.playerCaptionsTracklistRenderer.captionTracks[]`. Each entry carries at least `baseUrl`, `languageCode`, `name`, `vssId`, and `kind` (equal to `"asr"` for auto-generated tracks). Model exactly these in the Zod schema.

`selectOriginalTrack()` is a pure function in `src/core/trackSelector.ts`. It takes the validated tracks plus audio-track metadata and returns the chosen track **together with the reason for the choice** (a discriminated union — useful for logging and for tests).

Fallback chain, in order:

1. If `playerCaptionsTracklistRenderer.audioTracks` and `defaultAudioTrackIndex` exist, follow that index to identify the default audio language, then match the corresponding caption track.
2. Otherwise, look for a `defaultAudioLanguage`-style field (inspect `videoDetails` and `microformat.playerMicroformatRenderer`) and match against `languageCode`.
3. Otherwise, take the first **non-ASR** track.
4. Otherwise, take the first track available.

When several tracks exist for the same language, **prefer the manual track over the ASR track**.

## 1.4 Step 3 — Download

Append `&fmt=json3` to the `baseUrl`. The response contains an `events[]` array; each event carries `tStartMs`, `dDurationMs`, and a `segs[]` array whose `utf8` values are concatenated. Validate with the `timedText` schema.

Always prefer this format — it avoids XML parsing and HTML entity unescaping.

Distinguish in the returned error: empty response, HTML response (consent wall), HTTP 429.

## 1.5 Step 4 — Normalization

The only real algorithmic work in the project. Pure functions, fully unit-tested.

### 1.5a Deduplication

Auto-captions use a sliding window: each segment repeats part of the previous segment's text. Untreated, the transcript is roughly twice as long as it should be and is unreadable.

Expected approach: for each incoming segment, compare its beginning against the end of the accumulated text and remove the longest overlap found. Work **at word level, not character level**. A comparison window of around fifteen words is sufficient.

**Do not apply deduplication to manual tracks.** They have no sliding-window artifact, and running it would produce false positives on legitimate repetition. Branch on the track's `kind`.

Edge cases: empty segments, segments containing only bracketed annotations, identical consecutive segments.

### 1.5b Grouping

Group segments into blocks of a target duration. **M1: 60 seconds, a constant** (it becomes a setting in M2).

- The block's timestamp is that of its first segment.
- Do not cut mid-sentence: if the segment that pushes past the target does not end in strong punctuation, continue to the next one, up to a hard ceiling of 1.5× the target.
- Join with single spaces, collapse repeated whitespace, strip internal line breaks.

### 1.5c Cleanup

- Normalize non-breaking spaces and control characters.
- Strip bracketed annotations (`[Music]`, `[Applause]`).
- **Do not** attempt to fix punctuation or capitalization. High risk of degradation, low upside.

## 1.6 Step 5 — Markdown output

Header block: video title, channel, URL, duration, detected language, an explicit note if the track is auto-generated, and extraction date.

Then the transcript blocks, each prefixed with `[MM:SS]` rendered as a clickable link to `URL&t=NNNs`.

Copy to clipboard from the popup. The popup's status line confirms success, stating the language selected and the number of blocks produced.

## 1.7 UI — toolbar popup

**Decided during M1, replacing an earlier plan for an injected in-page button.** Verse injects nothing into YouTube's UI. Clicking the extension icon opens the popup, and that popup is the entire M1 interface.

This removes three of the pitfalls listed in 0.8 outright: there is no YouTube DOM anchor to lose, no Tailwind-in-Shadow-DOM problem and no preflight leakage, and no theme to match.

The popup is React and Tailwind in its own document. On open it reads the active tab, and on a `/watch` page it immediately asks the content script to extract:

- Detected language, with auto-generated vs manual indicated.
- One primary button, **Copy Markdown**, writing to the clipboard with `navigator.clipboard` — the popup is a focused document, so no content-script clipboard workaround is needed.
- A status line (`Toast`) reporting the language and block count on success, or a message mapped from `ExtractionErrorKind` by an exhaustive `switch` on failure.
- Off a `/watch` page: an explanation, and no message sent.

Everything else the popup gains at M2 — track selector, output format, block duration, download, preview — stays at M2.

A content script is still required, because reading the page and fetching captions must happen on youtube.com's own origin. It is **headless**: no UI, no Shadow DOM, just a typed `runtime.onMessage` handler with a per-video result cache. Rendering nothing is what guarantees it cannot break the host page.

## 1.8 M1 acceptance criteria

- [ ] `pnpm typecheck` and `pnpm lint` pass with zero warnings.
- [ ] No `any` in `src/core/`; the lint rule blocking browser globals in `src/core/` is active and passing.
- [ ] A one-hour English talk with manual captions produces correct Markdown with no duplicated text.
- [ ] A French video with ASR-only captions produces French output with no sliding-window repetition.
- [ ] A dubbed video produces the **original** language, not the dubbed one.
- [ ] A video with no captions shows the correct message and does not throw.
- [ ] Clicking through three videos in a row via suggestions extracts the correct transcript each time, checked by opening the popup on each (SPA check).
- [ ] No occurrence of `tlang` anywhere in the codebase.
- [ ] The popup renders correctly and nothing at all is injected into YouTube's page.
- [ ] Opening the popup on a non-`/watch` tab explains itself and sends no message.
- [ ] Block timestamps, when clicked, seek to the correct point in the video.
- [ ] Verse is used for real over several days before M2 begins.

---

# Part 2 — Milestone M2: Comfort

**Prerequisite:** M1 working and used in practice.

**Explicitly not in M2:** no Obsidian integration, no templating, no keyboard shortcut.

## 2.1 Settings layer

`src/storage/` — a typed wrapper over WXT's storage API, with a **Zod schema for the settings object** and defaults. Migrate cleanly when the schema gains fields. M1's constants become the defaults.

Settings: default block duration, default output format, strip bracketed annotations, manual vs ASR preference, download filename template.

## 2.2 Popup

React, Tailwind, shares components with the content script where sensible.

On a `/watch` page:

- Detected language, with ASR vs manual indicated.
- A selector to force a different track. If the user picks a translated track, show a clear warning that the content will be machine-translated.
- Output format choice: Markdown / plain text / SRT.
- Block duration setting.
- Buttons: Copy, Download as `.md`.
- Preview of the first 500 characters.

Off a `/watch` page: greyed out with an explanation.

## 2.3 Options page

React form over the settings layer. Values persist across browser restarts.

## 2.4 Chapters

Best effort. **Missing chapters must never cause extraction to fail.**

Two sources, in order:

1. Chapter markers in the player response under `playerOverlays` — look for a `decoratedPlayerBarRenderer` → `markersMap` structure with a chapter-type entry. **Verify this path at runtime**; it changes regularly. Add it to the Zod schema as fully optional.
2. Fallback: parse leading timestamps in the video description (`MM:SS` or `HH:MM:SS` followed by a title).

When chapters exist, the Markdown output gains a table of contents after the header, and a section heading is inserted at the start of each chapter with the blocks nested underneath.

## 2.5 Additional output formats

**Plain text** — paragraphs joined, no timestamps, no header.

**SRT** — standard subtitles built from the segments *before* grouping.

## 2.6 M2 acceptance criteria

- [ ] A video with creator-defined chapters produces a transcript organized under those chapters.
- [ ] A video without chapters produces the M1 output unchanged, with no error.
- [ ] Forcing a non-original track works and displays the translation warning.
- [ ] Settings persist across browser restarts and survive a schema addition.
- [ ] SRT output loads correctly in a standard video player.

---

# Part 3 — Milestone M3: Integration

**Prerequisite:** M2 working.

## 3.1 Obsidian integration

Obsidian's **Local REST API** community plugin exposes a local HTTP server. Verse POSTs the Markdown note to it.

Settings: server URL and port, authentication token, destination folder, note name template. Validate the settings shape with Zod, and validate the server's response.

On connection failure, **fall back silently to clipboard copy** with an explicit message. Never lose an extracted transcript.

Do not use the `obsidian://` URI scheme — URL length limits make it unusable for long transcripts.

## 3.2 Templating

User-editable templates for the note header and filename, with placeholders for title, channel, URL, video ID, duration, language, and extraction date.

## 3.3 Keyboard shortcut

Configurable via the `commands` manifest key, triggering extraction with current defaults.

## 3.4 M3 acceptance criteria

- [ ] A transcript reaches the Obsidian vault in the configured folder with correct frontmatter.
- [ ] With Obsidian closed, extraction still succeeds via clipboard fallback and says so.
- [ ] Keyboard shortcut works without opening the popup.

---

# Appendix A — Testing

Vitest, using WXT's Vitest plugin for the fake browser environment. `pnpm test`.

Capture real player responses as JSON in `test/fixtures/`, covering: a manual-caption video, an ASR-only video, a multilingual video with several audio tracks, a video with no captions, a video with chapters, a video without chapters.

The `src/core/` modules are pure and need no mocking — fixtures in, assertions out. This is why the core boundary is worth enforcing.

Priority tests, in order of importance:

1. **ASR deduplication** — deduplicated text contains no adjacent bigram repetition arising from sliding-window overlap.
2. **Track selection** — for every fixture, the selected language matches the original audio, and the returned selection reason is the expected one.
3. **No translation** — assert that no URL built anywhere in the codebase contains a `tlang` parameter.
4. **Schema resilience** — feed each schema a fixture with unexpected extra keys and with missing optional fields; parsing must still succeed.
5. **Grouping** — blocks respect the target duration and do not cut sentences.
6. **Formatting** — link timestamps match block start seconds.

Manual test set to keep on hand: a long English talk with chapters, a French video without chapters, a dubbed multi-language video (the trap case for track selection), a Short.

---

# Appendix B — Usage note

Transcripts belong to the video creators. Verse is intended for reading, note-taking, and personal research. Republishing extracted content is a separate question and outside the scope of this project.
