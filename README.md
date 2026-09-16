# Verse

Extract a YouTube video's transcript with timestamps, **in its original spoken
language**, formatted for pasting into an LLM or into Obsidian.

Personal project. See [SPEC.md](./SPEC.md) for the full specification.

## Using it

```bash
pnpm install
pnpm dev      # launches a browser with the extension loaded
pnpm build    # writes .output/chrome-mv3 for loading unpacked
```

On a YouTube video, click the Verse icon. The popup reads the captions, reports the
detected language, and copies timestamped Markdown to the clipboard.

## Checks

```bash
pnpm typecheck   # both tsconfigs, including the DOM-free core config
pnpm lint        # biome
pnpm test        # vitest
```

## Layout

`src/core/` is environment-agnostic: no DOM, no `chrome.*`, no React, so it can be
reused as-is in an Obsidian plugin later. That is enforced, not just intended —
`tsconfig.core.json` compiles it without the DOM lib, and a Biome override bans
browser and React imports there.

`src/browser/` is the only place that touches the page or the network. It validates
everything it reads with Zod and hands `src/core/` typed domain objects.

The content script is headless; the popup is the whole UI.
