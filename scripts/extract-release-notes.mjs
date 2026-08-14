#!/usr/bin/env node

/**
 * Prints one release's section from CHANGELOG.md.
 *
 * CHANGELOG.md is the merged, deduplicated list once the release branch has
 * been tidied. The release pull request body and the draft release notes are
 * generated separately by release-please, from the commits since the *last*
 * release - so after a prerelease is folded in they carry only the handful of
 * commits since that prerelease, while the changelog carries the release.
 *
 * For 5.1.0 that was 4 entries in the pull request body against 38 in the
 * changelog. The body and the draft are what people actually read, and
 * github-release copies the body into the draft, so both are rebuilt from here.
 *
 * Usage:
 *   node scripts/extract-release-notes.mjs CHANGELOG.md 5.1.0              # with heading
 *   node scripts/extract-release-notes.mjs CHANGELOG.md 5.1.0 --body-only  # without
 *   node scripts/extract-release-notes.mjs CHANGELOG.md 5.1.0 --splice body.md
 *
 * `--splice` rewrites a release pull request body in place, replacing what sits
 * between release-please's `---` delimiters and leaving the rest byte for byte.
 * That structure is not decoration: github-release parses the body to find the
 * release, and an earlier hand-edit of it is why the 5.1.0-beta draft had to be
 * created manually. The heading written here comes from CHANGELOG.md, which is
 * the same shape release-please writes.
 */

import { readFileSync, writeFileSync } from 'node:fs';

const [, , file, version, ...flags] = process.argv;
if (!file || !version) {
  console.error('usage: extract-release-notes.mjs <changelog> <version> [--body-only] [--splice <file>]');
  process.exit(1);
}

const lines = readFileSync(file, 'utf8').split('\n');
const HEADING = /^##\s+\[?(?<version>\d+\.\d+\.\d+[^\]\s)]*)\]?/;

let start = -1;
let end = lines.length;

for (let i = 0; i < lines.length; i += 1) {
  const match = lines[i].match(HEADING);
  if (!match) continue;
  if (start === -1 && match.groups.version === version) {
    start = i;
  } else if (start !== -1) {
    end = i;
    break;
  }
}

if (start === -1) {
  console.error(`no section for ${version} in ${file}`);
  process.exit(1);
}

const section = lines.slice(flags.includes('--body-only') ? start + 1 : start, end);

// Trim leading and trailing blank lines, leaving the interior untouched.
while (section.length && section[0].trim() === '') section.shift();
while (section.length && section[section.length - 1].trim() === '') section.pop();

const notes = section.join('\n');

const spliceIndex = flags.indexOf('--splice');
if (spliceIndex === -1) {
  process.stdout.write(`${notes}\n`);
} else {
  const bodyFile = flags[spliceIndex + 1];
  if (!bodyFile) {
    console.error('--splice needs a file');
    process.exit(1);
  }

  const bodyLines = readFileSync(bodyFile, 'utf8').split('\n');
  const first = bodyLines.indexOf('---');
  const last = bodyLines.lastIndexOf('---');

  if (first === -1 || last === first) {
    console.error(`${bodyFile} does not look like a release pull request body`);
    process.exit(1);
  }

  const rebuilt = [
    ...bodyLines.slice(0, first + 1),
    '',
    '',
    notes,
    '',
    ...bodyLines.slice(last),
  ].join('\n');

  writeFileSync(bodyFile, rebuilt);
  console.error(`spliced ${(notes.match(/^\* /gm) || []).length} entries into ${bodyFile}`);
}
