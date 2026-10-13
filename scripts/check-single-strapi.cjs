#!/usr/bin/env node
'use strict';

/**
 * Fails when the lockfile holds more than one version of Strapi itself.
 *
 * Strapi core resolves its built-in plugins (content-type-builder,
 * content-manager, upload, ...) through the workspace's hoisted node_modules,
 * not through its own dependencies. With two copies installed it can pick up
 * the other version's plugin: after the playgrounds moved to 5.57, a 5.52 copy
 * kept alive by the memory provider's auto-installed peer was loaded into a
 * 5.57 app at random, and boots failed with
 *
 *   TypeError: strapi.ai.admin.isEnabled is not a function
 *
 * in whichever CI job happened to resolve it. Dependabot moves the playgrounds'
 * pinned versions but not a locked peer, so this is easy to reintroduce.
 * `pnpm dedupe` is the fix when this fails.
 */

const fs = require('fs');
const path = require('path');

const LOCKFILE = path.join(__dirname, '..', process.argv[2] || 'pnpm-lock.yaml');
const PACKAGES = ['@strapi/strapi', '@strapi/core'];

const lock = fs.readFileSync(LOCKFILE, 'utf8');
let failed = false;

for (const name of PACKAGES) {
  const escaped = name.replace(/[/@]/g, (c) => `\\${c}`);
  const versions = new Set(
    [...lock.matchAll(new RegExp(`^  '?${escaped}@(\\d+\\.\\d+\\.\\d+[^(:']*)`, 'gm'))].map(
      (match) => match[1]
    )
  );

  if (versions.size === 1) {
    console.log(`  ok    ${name} ${[...versions][0]}`);
  } else {
    failed = true;
    console.log(`  FAIL  ${name}: ${versions.size} versions (${[...versions].join(', ')})`);
  }
}

if (failed) {
  console.log('\nMore than one Strapi in the workspace. Run `pnpm dedupe`.');
  process.exit(1);
}
