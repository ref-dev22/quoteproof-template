import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const patch = path.join(root, "docs", "local-policy-3600.patch");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "quoteproof-policy-workshop-"));
const checkout = path.join(tempRoot, "checkout");
const policyFiles = [
  "packages/hardhat/test/QuoteProofRegistry.test.ts",
  "packages/hardhat/test/quoteCompareRoute.test.ts",
  "packages/hardhat/test/quoteReceipt.test.ts",
  "packages/hardhat/utils/quoteReceipt.ts",
];

function run(command, args, cwd, options = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...(options.env ?? {}) },
    stdio: options.inherit ? "inherit" : ["ignore", "pipe", "pipe"],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const details = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    throw new Error(`${command} ${args.join(" ")} exited with ${result.status}\n${details}`);
  }
  return `${result.stdout ?? ""}${result.stderr ?? ""}`;
}

function linkExisting(relativePath) {
  const source = path.join(root, relativePath);
  const target = path.join(checkout, relativePath);
  if (!fs.existsSync(source) || fs.existsSync(target)) return;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.symlinkSync(source, target, process.platform === "win32" ? "junction" : "dir");
}

function makeCheckout() {
  run("git", ["-c", "core.autocrlf=false", "clone", "--quiet", "--no-local", root, checkout], root);
  // Reuse installed dependencies. No install is repeated; Hardhat writes generated output inside the temp clone.
  linkExisting("node_modules");
}

function assertSourceCheckoutClean() {
  const dirty = run("git", ["status", "--porcelain", "--untracked-files=all"], root).trim();
  if (dirty) throw new Error(`workshop requires a clean committed checkout; refusing to clone a dirty worktree:\n${dirty}`);
  const commit = run("git", ["rev-parse", "HEAD"], root).trim();
  console.log(`workshop source commit: ${commit}`);
}

function assertPatchFootprint() {
  run("git", ["apply", "--check", patch], checkout);
  const changed = run("git", ["apply", "--numstat", patch], checkout)
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => line.split("\t").at(-1));
  if (changed.join("\n") !== policyFiles.join("\n")) {
    throw new Error(`workshop patch has unexpected files: ${changed.join(", ")}`);
  }
}

function applyPatch(include) {
  const args = ["apply"];
  if (include) args.push(`--include=${include}`);
  args.push(patch);
  run("git", args, checkout, { inherit: true });
}

function assertExpectedMismatch() {
  const code = [
    "const {FEED_ID,computeReceiptCommitment,verifyReceiptObject}=require('./packages/hardhat/utils/quoteReceipt');",
    "const receipt={schemaVersion:'1',chainId:'31337',registry:'0x0000000000000000000000000000000000000001',issuer:'0x0000000000000000000000000000000000000002',nonce:'0',cents:'100',oracle:'0x0000000000000000000000000000000000000003',feedId:FEED_ID,roundId:'7',price:'10000000',decimals:'8',observedAt:'1000000',recordedAt:'1000100',maximumAge:'3600',tinybars:'1000000000',commitment:'0x'+'0'.repeat(64)};",
    "receipt.commitment=computeReceiptCommitment(receipt);",
    "const result=verifyReceiptObject(receipt,{expectedChainId:31337n,expectedRegistry:receipt.registry,expectedOracle:receipt.oracle,expectedIssuer:receipt.issuer});",
    "const expected='maximumAge does not match the frozen policy';",
    "if(result.valid||result.errors.length!==1||result.errors[0]!==expected){console.error(JSON.stringify(result));process.exit(1)}",
    "console.log('incomplete policy correctly rejected: '+expected);",
  ].join("");
  run(process.execPath, ["-r", "ts-node/register/transpile-only", "-e", code], checkout, {
    inherit: true,
    env: { TS_NODE_PROJECT: path.join("packages", "hardhat", "tsconfig.json") },
  });
}

try {
  assertSourceCheckoutClean();
  makeCheckout();
  assertPatchFootprint();
  assertExpectedMismatch();
  applyPatch();
  run(process.execPath, ["scripts/runHardhatWithEnv.cjs", "test"], path.join(checkout, "packages", "hardhat"), {
    inherit: true,
  });
  const applied = run("git", ["diff", "--name-only"], checkout).trim().split(/\r?\n/).filter(Boolean);
  if (applied.join("\n") !== policyFiles.join("\n")) {
    throw new Error(`workshop application changed unexpected files: ${applied.join(", ")}`);
  }
  console.log("local policy workshop passed: incomplete mismatch and coordinated mock suite");
} finally {
  const resolvedTemp = path.resolve(tempRoot);
  const resolvedParent = path.resolve(os.tmpdir());
  if (path.dirname(resolvedTemp) !== resolvedParent) {
    throw new Error(`refusing to remove unexpected temporary path: ${resolvedTemp}`);
  }
  const dependencyLink = path.join(tempRoot, "checkout", "node_modules");
  if (fs.existsSync(dependencyLink) && fs.lstatSync(dependencyLink).isSymbolicLink()) {
    fs.unlinkSync(dependencyLink);
  }
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
