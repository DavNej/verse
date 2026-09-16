import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..');
const SOURCE_DIRS = ['src', 'entrypoints'];

/**
 * The translation parameter YouTube's caption endpoint accepts, spelled in a way
 * that this guard test does not trip over itself.
 */
const FORBIDDEN = ['t', 'lang'].join('');

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      found.push(...sourceFiles(path));
    } else if (/\.tsx?$/.test(entry)) {
      found.push(path);
    }
  }
  return found;
}

describe('no translation anywhere in the codebase', () => {
  it('never mentions the translation parameter in shipped source', () => {
    const offenders = SOURCE_DIRS.flatMap((dir) => sourceFiles(join(ROOT, dir))).filter((path) =>
      readFileSync(path, 'utf8').includes(FORBIDDEN),
    );

    expect(offenders).toEqual([]);
  });
});
