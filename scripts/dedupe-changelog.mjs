#!/usr/bin/env node

/**
 * Removes duplicate entries from a generated changelog.
 *
 * GitHub's "Merge pull request" commits carry the pull request title in their
 * body:
 *
 *   Merge pull request #171 from strapi-community/feat/cache-dashboard
 *
 *   feat: add a cache statistics endpoint for the admin dashboard
 *
 * release-please parses every conventional commit it finds in a message, so
 * that body line becomes an entry attributed to the merge commit - and the
 * commit on the branch underneath produces an identical one. The same change
 * is listed twice under different shas. There is no config switch for it:
 * BEGIN_COMMIT_OVERRIDE is keyed on the pull request, so it would suppress
 * both, and `changelog-type: github` drops the conventional-commit sections.
 *
 * This is a one-off. Every pull request since is squash-merged, which produces
 * a single commit and a single entry, and once this release lands
 * last-release-sha sits past all 22 merge commits.
 *
 * Entries are matched on their text with the trailing ([sha](url)) link
 * stripped, so the two shas do not defeat the comparison. The first occurrence
 * wins, which keeps the original ordering.
 *
 * Usage:
 *   node scripts/dedupe-changelog.mjs CHANGELOG.md            # rewrite in place
 *   node scripts/dedupe-changelog.mjs notes.md --stdout       # print instead
 *   gh release view v5.1.0-beta --json body -q .body > n.md
 *     && node scripts/dedupe-changelog.mjs n.md --stdout
 */

import { readFileSync, writeFileSync } from 'node:fs';

const [, , file, ...flags] = process.argv;
if (!file) {
  console.error('usage: dedupe-changelog.mjs <file> [--stdout]');
  process.exit(1);
}

const toStdout = flags.includes('--stdout');
const input = readFileSync(file, 'utf8');

/**
 * The text of an entry, with the trailing commit link removed.
 *
 * `* fix: a thing ([abc1234](https://github.com/o/r/commit/abc1234))`
 *   -> `fix: a thing`
 *
 * Issue links inside the text are deliberately kept: two entries differing
 * only by which issue they cite are different entries.
 */
function entryKey(line) {
  return line
    .replace(/^\s*[*-]\s+/, '')
    .replace(/\s*\(\[[0-9a-f]{7,40}\]\([^)]*\)\)\s*$/, '')
    .trim()
    .toLowerCase();
}

const isEntry = (line) => /^\s*[*-]\s+\S/.test(line);
// A heading starts a new scope: the same change legitimately appears under
// both Features and Bug Fixes in different releases, and this file may hold
// several releases.
const isHeading = (line) => /^#{1,6}\s/.test(line) || /^<details>/.test(line);

const lines = input.split('\n');
const out = [];
let seen = new Set();
let removed = 0;
const removedText = [];

for (const line of lines) {
  if (isHeading(line)) {
    seen = new Set();
    out.push(line);
    continue;
  }

  if (isEntry(line)) {
    const key = entryKey(line);
    if (key && seen.has(key)) {
      removed += 1;
      removedText.push(key);
      continue;
    }
    seen.add(key);
  }

  out.push(line);
}

const result = out.join('\n');

if (toStdout) {
  process.stdout.write(result);
} else {
  writeFileSync(file, result);
}

const report = removed
  ? `removed ${removed} duplicate ${removed === 1 ? 'entry' : 'entries'}:\n` +
    removedText.map((t) => `  - ${t}`).join('\n')
  : 'no duplicates found';
console.error(report);
