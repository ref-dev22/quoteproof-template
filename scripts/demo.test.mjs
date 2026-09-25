import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const demo = path.join(root, "scripts", "demo.mjs");
const source = path.join(root, "examples", "adversarial");

function runDemo(fixturesDir, offline = true, rpcUrl) {
  return spawnSync(process.execPath, [demo, ...(offline ? ["--offline"] : [])], {
    cwd: root,
    env: {
      ...process.env,
      ...(fixturesDir ? { DEMO_FIXTURES_DIR: fixturesDir } : {}),
      ...(rpcUrl ? { HEDERA_RPC_URL: rpcUrl } : {}),
    },
    encoding: "utf8",
    timeout: 120000,
    maxBuffer: 1024 * 1024,
  });
}

test("offline demo catches all three fixture mutations", () => {
  const result = runDemo();
  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stdout,
    /\| genuine \| valid \| skipped \(offline\) \| skipped \(offline\) \| PASS \|/,
  );
  assert.match(
    result.stdout,
    /\| tinybars \+1 \| invalid \| skipped \(offline\) \| skipped \(offline\) \| CAUGHT \|/,
  );
  assert.match(
    result.stdout,
    /\| cents 1000 \| valid \| skipped \(offline\) \| skipped \(offline\) \| CAUGHT \|/,
  );
  assert.match(
    result.stdout,
    /\| double price \| valid \| skipped \(offline\) \| skipped \(offline\) \| CAUGHT \|/,
  );
  assert.match(
    result.stdout,
    /receipt commitment does not match the independent expected commitment/,
  );
});

test("unreachable RPC skips network checks without failing the expected verdicts", () => {
  const result = runDemo(undefined, false, "http://127.0.0.1:1");
  assert.equal(result.status, 0, result.stderr);
  assert.equal((result.stdout.match(/skipped \(offline\)/g) ?? []).length, 8);
  assert.doesNotMatch(result.stdout, /UNEXPECTED/);
});

test("demo fails if a tampered case unexpectedly passes", (t) => {
  const fixturesDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "quoteproof-demo-"),
  );
  t.after(() => fs.rmSync(fixturesDir, { recursive: true, force: true }));
  for (const file of fs.readdirSync(source))
    fs.copyFileSync(path.join(source, file), path.join(fixturesDir, file));
  fs.copyFileSync(
    path.join(source, "genuine.json"),
    path.join(fixturesDir, "recomputed-cents-1000.json"),
  );
  const result = runDemo(fixturesDir);
  assert.equal(result.status, 1, result.stderr);
  assert.match(
    result.stdout,
    /\| cents 1000 \| valid \| skipped \(offline\) \| skipped \(offline\) \| UNEXPECTED \|/,
  );
});
