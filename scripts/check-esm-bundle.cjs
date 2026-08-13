#!/usr/bin/env node
'use strict';

/**
 * Assert the ESM bundles contain no CommonJS-only globals.
 *
 * The plugin ships both halves of a dual package: `require` resolves
 * dist/server/index.js, `import` resolves dist/server/index.mjs. Rollup leaves
 * `require`, `require.resolve`, `__dirname` and `__filename` untouched when it
 * emits ESM, so any of them reaching the .mjs is a ReferenceError the first
 * time that line runs - for a consumer who did nothing wrong except import the
 * package the way its own exports map advertises.
 *
 * This is the failure mode behind #128, where a module-interop problem
 * presented as an unrelated "provider not installed" message. It is invisible
 * to the e2e suite, which loads the CommonJS entry.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const BUNDLES = [
  'packages/plugin-rest-cache/dist/server/index.mjs',
  'packages/plugin-rest-cache/dist/types/index.mjs',
];

// `import.meta.url` is legal here and is how the ESM half is meant to build a
// require - so `createRequire` itself is fine. What must not appear is a bare
// use of the CJS globals.
const FORBIDDEN = [
  { name: 'require.resolve(', re: /(?<![.\w$])require\s*\.\s*resolve\s*\(/g },
  { name: 'require(', re: /(?<![.\w$])require\s*\(/g },
  { name: '__dirname', re: /(?<![.\w$])__dirname(?![\w$])/g },
  { name: '__filename', re: /(?<![.\w$])__filename(?![\w$])/g },
];

let failed = false;

for (const rel of BUNDLES) {
  const abs = path.join(ROOT, rel);

  if (!fs.existsSync(abs)) {
    console.error(`✖ ${rel} does not exist - build the plugin first.`);
    failed = true;
    continue;
  }

  const source = fs.readFileSync(abs, 'utf8');
  const lines = source.split('\n');

  for (const { name, re } of FORBIDDEN) {
    lines.forEach((line, i) => {
      re.lastIndex = 0;
      if (re.test(line)) {
        console.error(
          `✖ ${rel}:${i + 1} uses "${name}", which is not defined in an ES module:\n    ${line.trim()}`
        );
        failed = true;
      }
    });
  }
}

if (failed) {
  console.error(
    '\nUse createRequire(import.meta.url) and call .resolve() on it, so the same\n' +
      'code works in both halves of the dual package.'
  );
  process.exit(1);
}

console.log(`✔ ESM bundles are free of CommonJS-only globals (${BUNDLES.length} checked)`);
