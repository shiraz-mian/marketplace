import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const includeServices = process.argv.includes("--services");
const steps = [
  {
    name: "Formatting",
    cwd: root,
    args: ["node_modules/prettier/bin/prettier.cjs", "--check", "."],
  },
  {
    name: "Backend tests",
    cwd: path.join(root, "server"),
    args: ["--test", "--test-concurrency=1", "--test-reporter=spec"],
  },
  {
    name: "MongoDB transaction integration",
    cwd: path.join(root, "server"),
    args: [
      "--test",
      "--test-reporter=spec",
      "integration/commerce.integration.js",
    ],
  },
  {
    name: "Frontend lint",
    cwd: path.join(root, "client"),
    args: ["node_modules/eslint/bin/eslint.js", "."],
  },
  {
    name: "Frontend tests",
    cwd: path.join(root, "client"),
    args: [
      "node_modules/vitest/vitest.mjs",
      "run",
      "--pool=threads",
      "--maxWorkers=1",
    ],
  },
  {
    name: "Frontend production build",
    cwd: path.join(root, "client"),
    args: ["node_modules/vite/bin/vite.js", "build"],
  },
  ...(includeServices
    ? [
        {
          name: "Redis and Elasticsearch integration",
          cwd: path.join(root, "server"),
          args: [
            "--test",
            "--test-concurrency=1",
            "--test-reporter=spec",
            "integration/cart.test.js",
            "integration/productSearch.test.js",
          ],
          env: { REDIS_INTEGRATION: "1", ELASTICSEARCH_INTEGRATION: "1" },
        },
      ]
    : []),
];
const run = (step) =>
  new Promise((resolve) => {
    console.log(`\n${step.name}`);
    const started = performance.now();
    let output = "";
    const env = { ...process.env, NO_COLOR: "1", ...step.env };
    delete env.FORCE_COLOR;
    const child = spawn(process.execPath, step.args, {
      cwd: step.cwd,
      windowsHide: true,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const collect = (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stdout.write(text);
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.once("error", (error) => {
      output += error.message;
    });
    child.once("close", (code) => {
      const plain = output.replace(/\u001b\[[0-9;]*m/g, "");
      const nodeTests = plain.match(/(?:ℹ|#) tests (\d+)/);
      const uiTests = plain.match(/Tests\s+(\d+) passed/);
      resolve({
        name: step.name,
        status: code === 0 ? "passed" : "failed",
        exitCode: code,
        durationMs: Math.round(performance.now() - started),
        ...(nodeTests || uiTests
          ? { tests: Number((nodeTests || uiTests)[1]) }
          : {}),
        summary: plain.trim().split(/\r?\n/).slice(-12).join("\n"),
      });
    });
  });
const startedAt = new Date().toISOString();
const checks = [];
for (const step of steps) checks.push(await run(step));
const passed = checks.every((check) => check.status === "passed");
const report = {
  startedAt,
  finishedAt: new Date().toISOString(),
  node: process.version,
  platform: process.platform,
  scope: includeServices ? "local services included" : "core checks only",
  passed,
  providerCoverage: {
    razorpay:
      "standard and Route flows simulated in automated tests; Route access deferred",
    s3: "simulated in automated tests; bucket setup deferred",
  },
  checks,
};
await mkdir(path.join(root, "artifacts"), { recursive: true });
await writeFile(
  path.join(root, "artifacts", "verification.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(
  `\n${passed ? "All checks passed." : "Some checks failed."} Evidence: artifacts/verification.json`,
);
process.exitCode = passed ? 0 : 1;
