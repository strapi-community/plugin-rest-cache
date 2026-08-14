#!/usr/bin/env node

/**
 * Boots each playground in a real child process and asserts it comes up.
 *
 * This exists because of a blind spot that let a release-blocking bug reach
 * `main`: every e2e test boots Strapi *inside jest*, and jest resolves modules
 * with its own resolver, which searches upwards far more liberally than Node
 * does. The plugin resolves its cache provider by package name at boot, so a
 * provider that jest can find but Node cannot produces a suite that is entirely
 * green while `strapi start` fails on the very first request.
 *
 * That is not hypothetical - it is exactly how the redis provider shipped
 * unresolvable under pnpm while `e2e_redis` passed. See the resolution comment
 * in server/src/bootstrap.ts.
 *
 * So: no jest, no test framework, no mocks. A real `node` process, the real
 * boot path, real Node resolution.
 *
 * Usage: node scripts/boot-smoke.mjs [--provider memory|redis|both]
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const READY_TIMEOUT_MS = 180000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseArgs(argv) {
  const args = { provider: 'both' };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--provider') {
      args.provider = argv[i + 1];
      i += 1;
    }
  }
  if (!['memory', 'redis', 'both'].includes(args.provider)) {
    throw new Error(`unknown provider "${args.provider}"`);
  }
  return args;
}

async function waitForReady(url, child, timeoutMs) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    // A crashed boot is the interesting case, and it is the one where polling
    // an HTTP port tells you nothing for the full timeout. Fail immediately
    // instead, so the provider error is what gets reported rather than a
    // generic "did not become ready".
    if (child.exitCode !== null) {
      throw new Error(`server exited with code ${child.exitCode} before becoming ready`);
    }
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      // not up yet
    }
    await sleep(500);
  }

  throw new Error(`server did not become ready within ${timeoutMs}ms`);
}

async function bootPlayground(provider, port) {
  const logs = [];

  const child = spawn(process.execPath, ['start-profiler.js'], {
    cwd: path.join(ROOT, 'playgrounds', provider),
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      STRAPI_DISABLE_UPDATE_NOTIFICATION: 'true',
      STRAPI_HIDE_STARTUP_MESSAGE: 'true',
      STRAPI_TELEMETRY_DISABLED: 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (d) => logs.push(d.toString()));
  child.stderr.on('data', (d) => logs.push(d.toString()));

  try {
    await waitForReady(`http://127.0.0.1:${port}/_health`, child, READY_TIMEOUT_MS);
    return { ok: true, logs };
  } catch (error) {
    return { ok: false, logs, error };
  } finally {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      const deadline = Date.now() + 15000;
      while (child.exitCode === null && Date.now() < deadline) {
        await sleep(200);
      }
      if (child.exitCode === null) child.kill('SIGKILL');
    }
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const providers = args.provider === 'both' ? ['memory', 'redis'] : [args.provider];

  console.log(`boot smoke test - Node ${process.version}\n`);

  const results = [];
  let port = 2137;

  for (const provider of providers) {
    process.stdout.write(`  booting ${provider} playground ... `);
    const result = await bootPlayground(provider, port);
    port += 1;

    console.log(result.ok ? 'ready' : 'FAILED');
    if (!result.ok) {
      console.log(`\n${result.logs.join('')}`);
      console.log(`  ${result.error.message}\n`);
    }
    results.push([result.ok, provider]);
  }

  console.log('');
  for (const [ok, provider] of results) {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${provider} playground boots under real Node resolution`);
  }

  const failed = results.filter(([ok]) => !ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
