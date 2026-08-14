#!/usr/bin/env node

/**
 * Folds prerelease changelog sections into the stable release that supersedes
 * them.
 *
 * release-please writes one section per release, and a prerelease is a release.
 * So shipping 5.1.0 after 5.1.0-beta leaves:
 *
 *   ## [5.1.0]        Bug Fixes, Documentation, Chores      <- since the beta
 *   ## [5.1.0-beta]   Features, Bug Fixes, Performance, ... <- the actual work
 *
 * which reads as though 5.1.0 contained almost nothing, while everything that
 * went into it sits under a heading for a version most people never installed.
 * Anyone upgrading 5.0.1 -> 5.1.0 wants one list.
 *
 * A prerelease is folded into the stable release with the same major.minor.patch
 * once that stable release exists. Entries keep their order, the stable
 * section's own entries first. The compare link is widened to start where the
 * earliest prerelease started, since the stable release now spans all of it.
 *
 * Runs from release-please.yml on the release branch, before the deduplicator.
 *
 * Usage: node scripts/consolidate-prerelease-changelog.mjs CHANGELOG.md [--stdout]
 */

import { readFileSync, writeFileSync } from 'node:fs';

const [, , file, ...flags] = process.argv;
if (!file) {
  console.error('usage: consolidate-prerelease-changelog.mjs <file> [--stdout]');
  process.exit(1);
}

const input = readFileSync(file, 'utf8');
const lines = input.split('\n');

const HEADING = /^##\s+\[?(?<version>\d+\.\d+\.\d+[^\]\s)]*)\]?/;
const SUBHEADING = /^###\s+(?<name>.+?)\s*$/;

// --- split the document into a preamble and one entry per release -----------
const preamble = [];
const sections = [];

for (const line of lines) {
  const match = line.match(HEADING);
  if (match) {
    sections.push({ version: match.groups.version, heading: line, body: [] });
  } else if (sections.length) {
    sections[sections.length - 1].body.push(line);
  } else {
    preamble.push(line);
  }
}

const baseOf = (version) => version.split('-')[0];
const isPrerelease = (version) => version.includes('-');

/** Split a section body into `### Name` groups, preserving their order. */
function splitSubsections(body) {
  const groups = [];
  let current = null;

  for (const line of body) {
    const match = line.match(SUBHEADING);
    if (match) {
      current = { name: match.groups.name, entries: [] };
      groups.push(current);
    } else if (current) {
      current.entries.push(line);
    }
    // Text before the first ### is release-please boilerplate; dropping it is
    // deliberate, the stable section supplies its own.
  }

  return groups;
}

const trimBlank = (entries) => {
  const out = [...entries];
  while (out.length && out[0].trim() === '') out.shift();
  while (out.length && out[out.length - 1].trim() === '') out.pop();
  return out;
};

// The canonical order from release-please-config.json's changelog-sections.
// Merging appends whole groups, so without this the folded-in sections land
// after Chores and a reader meets the housekeeping before the features.
const ORDER = [
  'Features',
  'Bug Fixes',
  'Performance',
  'Refactoring',
  'Reverts',
  'Documentation',
  'Build System',
  'Continuous Integration',
  'Tests',
  'Chores',
];
const rank = (name) => {
  const index = ORDER.indexOf(name);
  return index === -1 ? ORDER.length : index;
};

let folded = 0;
const dropped = new Set();

// Only the release being prepared, which is the topmost section. Folding every
// stable release would rewrite history: the first run reached back and merged
// the 2022 4.0.0-alpha.0 and 4.0.0-alpha.1 sections into 4.0.0, losing which
// alpha introduced what, in releases that shipped years ago.
for (const section of sections.slice(0, 1)) {
  if (isPrerelease(section.version)) continue;

  const supersedes = sections.filter(
    (other) => isPrerelease(other.version) && baseOf(other.version) === section.version
  );
  if (!supersedes.length) continue;

  const groups = splitSubsections(section.body);

  for (const pre of supersedes) {
    for (const group of splitSubsections(pre.body)) {
      const existing = groups.find((g) => g.name === group.name);
      if (existing) {
        existing.entries = [...trimBlank(existing.entries), '', ...trimBlank(group.entries)];
      } else {
        groups.push({ name: group.name, entries: trimBlank(group.entries) });
      }
    }
    dropped.add(pre);
    folded += 1;
  }

  // The stable release now spans the prereleases too, so compare from where the
  // earliest of them started rather than from the last prerelease tag.
  const earliest = supersedes[supersedes.length - 1];
  const from = earliest.heading.match(/compare\/([^.]+(?:\.[^.]+)*?)\.\.\./);
  if (from) {
    section.heading = section.heading.replace(/compare\/[^)]*?\.\.\./, `compare/${from[1]}...`);
  }

  groups.sort((a, b) => rank(a.name) - rank(b.name));

  section.body = groups.flatMap((group) => ['', `### ${group.name}`, '', ...trimBlank(group.entries), '']);
}

const out = [
  ...preamble,
  ...sections.filter((s) => !dropped.has(s)).flatMap((s) => [s.heading, ...s.body]),
].join('\n');

if (flags.includes('--stdout')) {
  process.stdout.write(out);
} else {
  writeFileSync(file, out.replace(/\n{3,}/g, '\n\n\n'));
}

console.error(
  folded
    ? `folded ${folded} prerelease section${folded === 1 ? '' : 's'} into its stable release`
    : 'no prerelease sections to fold'
);
