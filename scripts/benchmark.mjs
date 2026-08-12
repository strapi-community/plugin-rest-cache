#!/usr/bin/env node
/**
 * Benchmark harness for the REST cache plugin.
 *
 * Runs a set of scenarios back to back against the same playground, on the same
 * machine, in the same invocation. That ordering matters: absolute throughput on
 * a shared CI runner is noisy and not comparable between runs, but the RATIO
 * between "cache off" and "cache on" measured minutes apart on one runner is
 * stable and is the number worth publishing.
 *
 * Usage:
 *   node scripts/benchmark.mjs --provider memory [--duration 30]
 *                              [--connections 100] [--pipelining 10]
 *                              [--json out.json] [--markdown out.md]
 */

import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const autocannon = require("autocannon");

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const args = {
    provider: "memory",
    duration: 30,
    // Defaults are deliberately modest. The uncached scenario is the slowest
    // by construction, and if it saturates the machine it stops being a
    // measurement and becomes a timeout counter - every ratio computed against
    // it is then meaningless. 100 connections x pipelining 10 did exactly that
    // on a 4-core runner. Raise them for a soak test, not for a baseline.
    connections: 50,
    pipelining: 1,
    warmup: 5,
    port: 1337,
    path: "/api/homepage?populate=*",
    json: null,
    markdown: null,
  };

  for (let i = 2; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, "");
    const value = argv[i + 1];
    if (!(key in args)) throw new Error(`Unknown argument: ${argv[i]}`);
    args[key] = typeof args[key] === "number" ? Number(value) : value;
  }

  return args;
}

/**
 * Scenarios are expressed purely as environment overrides so they exercise the
 * same code path a user's configuration would.
 */
const SCENARIOS = [
  {
    id: "cache-disabled",
    name: "Cache disabled (reference)",
    env: { ENABLE_CACHE: "false" },
  },
  {
    id: "cache-no-etag",
    name: "Cache enabled, ETag off",
    env: { ENABLE_CACHE: "true", ENABLE_ETAG: "false" },
  },
  {
    id: "cache-etag",
    name: "Cache enabled, ETag on",
    env: { ENABLE_CACHE: "true", ENABLE_ETAG: "true" },
  },
];

async function waitForServer(url, timeoutMs = 180000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      // not up yet
    }
    await sleep(500);
  }

  throw new Error(`Server did not become ready within ${timeoutMs}ms`);
}

async function startServer(playground, env, port) {
  const child = spawn(process.execPath, ["start-profiler.js"], {
    cwd: path.join(ROOT, "playgrounds", playground),
    env: {
      ...process.env,
      ...env,
      PORT: String(port),
      HOST: "127.0.0.1",
      STRAPI_DISABLE_UPDATE_NOTIFICATION: "true",
      STRAPI_HIDE_STARTUP_MESSAGE: "true",
      STRAPI_TELEMETRY_DISABLED: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const logs = [];
  child.stdout.on("data", (d) => logs.push(d.toString()));
  child.stderr.on("data", (d) => logs.push(d.toString()));
  child.on("exit", (code) => {
    if (code !== null && code !== 0) {
      console.error(logs.join(""));
    }
  });

  return child;
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  const deadline = Date.now() + 15000;
  while (child.exitCode === null && Date.now() < deadline) {
    await sleep(200);
  }
  if (child.exitCode === null) child.kill("SIGKILL");
}

function run(opts) {
  return new Promise((resolve, reject) => {
    autocannon(opts, (err, result) => (err ? reject(err) : resolve(result)));
  });
}

async function benchmarkScenario(scenario, args) {
  const url = `http://127.0.0.1:${args.port}${args.path}`;

  process.stdout.write(`\n[bench] ${scenario.name}\n`);
  const server = await startServer(args.provider, scenario.env, args.port);

  try {
    await waitForServer(`http://127.0.0.1:${args.port}/_health`);

    // Prime the cache and let the JIT settle before measuring.
    process.stdout.write(`[bench]   warmup ${args.warmup}s\n`);
    await run({ url, connections: 10, duration: args.warmup });

    process.stdout.write(`[bench]   measuring ${args.duration}s\n`);
    const result = await run({
      url,
      connections: args.connections,
      pipelining: args.pipelining,
      duration: args.duration,
    });

    return {
      id: scenario.id,
      name: scenario.name,
      requests: result.requests,
      latency: result.latency,
      throughput: result.throughput,
      errors: result.errors,
      non2xx: result.non2xx,
      timeouts: result.timeouts,
    };
  } finally {
    await stopServer(server);
    // Let the port and any redis connections settle before the next scenario.
    await sleep(2000);
  }
}

function fmtBytes(n) {
  if (!Number.isFinite(n)) return "-";
  const units = ["B", "kB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1000 && i < units.length - 1) {
    v /= 1000;
    i += 1;
  }
  return `${v.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

function toMarkdown(results, args, meta) {
  const baseline = results.find((r) => r.id === "cache-disabled");
  const lines = [];

  lines.push("# Benchmarks");
  lines.push("");
  lines.push(
    "> Generated by `.github/workflows/benchmarks.yml`. Do not edit by hand - " +
      "re-run the workflow instead."
  );
  lines.push("");
  lines.push("## Context");
  lines.push("");
  lines.push(`- Generated: \`${meta.generatedAt}\``);
  lines.push(`- Plugin version: \`${meta.pluginVersion}\``);
  lines.push(`- Strapi version: \`${meta.strapiVersion}\``);
  lines.push(`- Node version: \`${process.version}\``);
  lines.push(`- Provider: \`${args.provider}\``);
  lines.push(`- Commit: \`${meta.commit}\``);
  lines.push(
    `- Runner: \`${meta.runner}\` (${os.cpus().length} cores, ${fmtBytes(
      os.totalmem()
    )} RAM)`
  );
  lines.push(`- Endpoint: \`${args.path}\``);
  lines.push(
    `- Load: ${args.connections} connections, pipelining ${args.pipelining}, ${args.duration}s per scenario (${args.warmup}s warmup)`
  );
  lines.push("");
  lines.push(
    "**Read the ratios, not the absolute numbers.** These run on shared CI " +
      "hardware, so throughput is not comparable between runs. All scenarios " +
      "in a single run execute back to back on the same machine, which makes " +
      "the relative difference meaningful."
  );
  lines.push("");

  const unreliable = results.filter((r) => r.errors + r.timeouts + r.non2xx > 0);
  if (unreliable.length) {
    const baselineFailed = unreliable.some((r) => r.id === "cache-disabled");
    lines.push("> [!WARNING]");
    lines.push(
      "> **These numbers are not trustworthy.** " +
        unreliable
          .map((r) => `${r.name} had ${r.errors + r.timeouts + r.non2xx} failed requests`)
          .join("; ") +
        "."
    );
    if (baselineFailed) {
      lines.push(
        "> The reference scenario is the divisor for every ratio below, so if it " +
          "was saturated rather than measured, every speedup figure is wrong. " +
          "Re-run with fewer connections or less pipelining."
      );
    }
    lines.push("");
  }

  lines.push("## Summary");
  lines.push("");
  lines.push(
    "| Scenario | Req/Sec (avg) | Latency p50 | Latency p99 | Failed | vs reference |"
  );
  lines.push("|---|---:|---:|---:|---:|---:|");
  for (const r of results) {
    const failed = r.errors + r.timeouts + r.non2xx;
    const speedup =
      baseline && r.id !== "cache-disabled" && baseline.requests.average > 0
        ? `${(r.requests.average / baseline.requests.average).toFixed(1)}x`
        : "-";
    lines.push(
      `| ${r.name} | ${Math.round(r.requests.average).toLocaleString()} | ${
        r.latency.p50
      } ms | ${r.latency.p99} ms | ${failed ? `**${failed}**` : "0"} | ${speedup}${
        failed ? " ⚠️" : ""
      } |`
    );
  }
  lines.push("");

  lines.push("## Detail");
  lines.push("");
  for (const r of results) {
    lines.push(`### ${r.name}`);
    lines.push("");
    lines.push("| Stat | 2.5% | 50% | 97.5% | 99% | Avg | Stdev | Max |");
    lines.push("|---|---|---|---|---|---|---|---|");
    lines.push(
      `| **Latency** | ${r.latency.p2_5} ms | ${r.latency.p50} ms | ${r.latency.p97_5} ms | ${r.latency.p99} ms | ${r.latency.average} ms | ${r.latency.stddev} | ${r.latency.max} ms |`
    );
    lines.push("");
    lines.push("| Stat | 1% | 2.5% | 50% | 97.5% | Avg | Stdev | Min |");
    lines.push("|---|---|---|---|---|---|---|---|");
    lines.push(
      `| **Req/Sec** | ${r.requests.p1} | ${r.requests.p2_5} | ${r.requests.p50} | ${r.requests.p97_5} | ${Math.round(r.requests.average)} | ${Math.round(r.requests.stddev)} | ${r.requests.min} |`
    );
    lines.push(
      `| **Bytes/Sec** | ${fmtBytes(r.throughput.p1)} | ${fmtBytes(r.throughput.p2_5)} | ${fmtBytes(r.throughput.p50)} | ${fmtBytes(r.throughput.p97_5)} | ${fmtBytes(r.throughput.average)} | ${fmtBytes(r.throughput.stddev)} | ${fmtBytes(r.throughput.min)} |`
    );
    lines.push("");
    if (r.errors || r.non2xx || r.timeouts) {
      lines.push(
        `> errors: ${r.errors}, non-2xx: ${r.non2xx}, timeouts: ${r.timeouts}`
      );
      lines.push("");
    }
  }

  return lines.join("\n");
}

async function main() {
  const args = parseArgs(process.argv);

  const meta = {
    generatedAt: new Date().toISOString(),
    commit: process.env.GITHUB_SHA || "local",
    runner: process.env.RUNNER_NAME || os.hostname(),
    pluginVersion: require(
      path.join(ROOT, "packages/plugin-rest-cache/package.json")
    ).version,
    strapiVersion: require(
      path.join(ROOT, `playgrounds/${args.provider}/package.json`)
    ).dependencies["@strapi/strapi"],
  };

  const results = [];
  for (const scenario of SCENARIOS) {
    results.push(await benchmarkScenario(scenario, args));
  }

  const markdown = toMarkdown(results, args, meta);

  if (args.json) writeFileSync(args.json, JSON.stringify({ meta, args, results }, null, 2));
  if (args.markdown) writeFileSync(args.markdown, `${markdown}\n`);
  if (!args.json && !args.markdown) process.stdout.write(`\n${markdown}\n`);

  const failed = results.filter((r) => r.errors || r.timeouts || r.non2xx);
  if (failed.length) {
    for (const r of failed) {
      process.stdout.write(
        `\n[bench] WARNING: "${r.name}" had ${r.errors} errors, ${r.timeouts} timeouts, ${r.non2xx} non-2xx\n`
      );
    }
    if (failed.some((r) => r.id === "cache-disabled")) {
      process.stdout.write(
        '\n[bench] The reference scenario failed requests, so every ratio in this\n' +
          '[bench] report is measured against a saturated server. Lower --connections\n' +
          '[bench] or --pipelining and re-run before publishing these numbers.\n'
      );
      process.exitCode = 1;
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
