#!/usr/bin/env node
/**
 * Stamp every publishable package with an experimental version.
 *
 * Version scheme: `0.0.0-experimental.<40-char sha>`.
 *
 * The `0.0.0-` prefix is what actually protects users, not the dist-tag.
 * `^5.1.0` desugars to `>=5.1.0 <6.0.0`, and a major of 0 fails that lower
 * bound; separately, npm never matches a prerelease unless the range itself
 * carries a prerelease on the same major.minor.patch tuple. Two independent
 * reasons an experimental build cannot be selected by an ordinary range.
 *
 * A scheme like `5.1.0-experimental.<sha>` would sit on the 5.1.0 tuple and
 * could be pulled in by `^5.1.0-0` or by a transitive prerelease-tolerant
 * range. Do not switch to it.
 *
 * Internal peer ranges have to be rewritten too. `workspace:^` packs to
 * `^5.0.1`, which cannot satisfy `0.0.0-experimental.*` - no range notation
 * can express "any 5.x stable OR this experimental build" - so installing the
 * result would ERESOLVE. Each internal reference is pinned to the exact
 * experimental version instead.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGES = join(ROOT, 'packages');

const sha = process.env.SHA ?? '';

if (!/^[0-9a-f]{40}$/.test(sha)) {
  console.error(`SHA must be a full 40-character commit sha, got: ${JSON.stringify(sha)}`);
  process.exit(1);
}

const version = `0.0.0-experimental.${sha}`;

const manifests = readdirSync(PACKAGES)
  .map((name) => join(PACKAGES, name, 'package.json'))
  .filter((file) => existsSync(file));

const names = new Set(
  manifests.map((file) => JSON.parse(readFileSync(file, 'utf8')).name)
);

for (const file of manifests) {
  const pkg = JSON.parse(readFileSync(file, 'utf8'));

  pkg.version = version;

  for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) {
    const deps = pkg[field];
    if (!deps) continue;

    for (const dep of Object.keys(deps)) {
      if (names.has(dep)) {
        deps[dep] = version;
      }
    }
  }

  writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log(`${pkg.name} -> ${version}`);
}
