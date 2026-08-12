#!/usr/bin/env node
'use strict';

/**
 * Fails if a published package imports something it does not declare.
 *
 * Yarn's flat node_modules hoists transitive dependencies to the top level, so
 * an undeclared import resolves fine in this monorepo and in most user apps -
 * right up until it doesn't. That is exactly how #128 happened: the providers
 * used `keyv` without declaring it, and whichever version won the hoist in a
 * user's tree decided whether the plugin worked at all.
 *
 * A full green test suite does not catch this, because the tests run inside the
 * same hoisted tree.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const PACKAGES = [
  'packages/plugin-rest-cache',
  'packages/provider-rest-cache-memory',
  'packages/provider-rest-cache-redis',
];

const SOURCE_DIRS = ['server/src', 'admin/src', 'lib'];

const IMPORT_RE = /(?:require\(\s*['"]([^'"]+)['"]\s*\)|from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\))/g;

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (/\.(js|jsx|mjs|cjs)$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

/** "lodash/fp" -> "lodash", "@keyv/redis/x" -> "@keyv/redis" */
function toPackageName(specifier) {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

let failed = false;

for (const pkgDir of PACKAGES) {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(ROOT, pkgDir, 'package.json'), 'utf8')
  );

  const declared = new Set([
    ...Object.keys(manifest.dependencies || {}),
    ...Object.keys(manifest.peerDependencies || {}),
    ...Object.keys(manifest.devDependencies || {}),
  ]);

  const used = new Set();
  const typeOnly = new Set();
  for (const sub of SOURCE_DIRS) {
    for (const file of walk(path.join(ROOT, pkgDir, sub))) {
      const raw = fs.readFileSync(file, 'utf8');

      // Collect JSDoc type references separately. `@typedef {import('koa')...}`
      // is not a runtime dependency, but it does end up in the emitted .d.ts,
      // so it is worth surfacing without failing the check.
      for (const match of raw.matchAll(/\/\*[\s\S]*?\*\//g)) {
        for (const t of match[0].matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
          const spec = t[1];
          if (spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('node:')) continue;
          const name = toPackageName(spec);
          if (!require('module').builtinModules.includes(name)) typeOnly.add(name);
        }
      }

      // Strip comments so JSDoc annotations are not mistaken for real imports.
      const source = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

      for (const match of source.matchAll(IMPORT_RE)) {
        const specifier = match[1] || match[2] || match[3];
        if (!specifier || specifier.startsWith('.') || specifier.startsWith('/')) continue;
        if (specifier.startsWith('node:')) continue;
        const name = toPackageName(specifier);
        if (require('module').builtinModules.includes(name)) continue;
        used.add(name);
      }
    }
  }

  const missing = [...used].filter((name) => !declared.has(name)).sort();

  const typesMissing = [...typeOnly].filter((n) => !declared.has(n)).sort();

  if (missing.length) {
    failed = true;
    console.error(`\n  ${manifest.name}`);
    for (const name of missing) console.error(`    undeclared: ${name}`);
  } else {
    console.log(`  ${manifest.name}: ok`);
  }

  if (typesMissing.length) {
    console.log(
      `    note: undeclared JSDoc type-only imports (emitted into .d.ts): ${typesMissing.join(', ')}`
    );
  }
}

if (failed) {
  console.error(
    '\nEvery import in a published package must be declared. It may resolve\n' +
      'today via hoisting and still break in a user application.\n'
  );
  process.exit(1);
}
