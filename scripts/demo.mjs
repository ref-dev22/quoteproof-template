import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hardhat = path.join(root, "packages", "hardhat");
const require = createRequire(import.meta.url);
const tsNode = require.resolve("ts-node/dist/bin.js");
const runner = path.join(hardhat, "scripts", "demoCases.ts");
const cases = [
  { name: "genuine", file: "genuine.json", local: "valid", expected: "match" },
  {
    name: "tinybars +1",
    file: "simple-tamper-tinybars-plus-one.json",
    local: "invalid",
  },
  {
    name: "cents 1000",
    file: "recomputed-cents-1000.json",
    local: "valid",
    expected: "mismatch",
  },
  {
    name: "double price",
    file: "recomputed-double-price.json",
    local: "valid",
    expected: "mismatch",
  },
];

function runCases(online) {
  const child = spawnSync(
    process.execPath,
    [tsNode, runner, ...(online ? ["--online"] : [])],
    {
      cwd: hardhat,
      env: { ...process.env, TS_NODE_TRANSPILE_ONLY: "1" },
      encoding: "utf8",
      timeout: online ? 30000 : 45000,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    },
  );
  if (child.error?.code === "ETIMEDOUT" && online) return null;
  if (child.error) throw child.error;
  let result;
  try {
    result = JSON.parse(child.stdout);
  } catch {
    throw new Error(
      `verifier did not return JSON: ${child.stderr.trim() || "no output"}`,
    );
  }
  if (child.status !== 0)
    throw new Error(`verifier exited ${child.status}: ${child.stderr.trim()}`);
  return result;
}

function networkUnavailable(result) {
  return (
    result.historicalOracle?.status === "unavailable" ||
    result.recordedComparison?.status === "provider_error" ||
    result.recordedComparison?.status === "wrong_network"
  );
}

function cell(value) {
  return String(value).replaceAll("|", "\\|").replaceAll(/\s+/g, " ");
}

function reportRow(caseInfo, result, online) {
  const local = result.localConsistency?.status ?? "invalid";
  const expected = result.expectedQuote?.status;
  const oracle = online ? result.historicalOracle?.status : "skipped (offline)";
  const stored = online
    ? result.recordedComparison?.status
    : "skipped (offline)";
  const goodNetwork = !online || (oracle === "match" && stored === "match");
  const expectedOutcome =
    local === caseInfo.local &&
    (caseInfo.expected === undefined || expected === caseInfo.expected) &&
    (caseInfo.name === "genuine" ? goodNetwork : true);
  const reasons = [
    ...(result.localConsistency?.errors ?? []),
    ...(result.expectedQuote?.errors ?? []),
  ];
  if (online && oracle === "mismatch")
    reasons.push(result.historicalOracle.error ?? "oracle round differs");
  if (online && stored === "mismatch")
    reasons.push("stored commitment differs");
  if (!expectedOutcome) reasons.push("unexpected verification outcome");
  return {
    cells: [
      caseInfo.name,
      local,
      expected,
      oracle,
      stored,
      expectedOutcome
        ? caseInfo.name === "genuine"
          ? "PASS"
          : "CAUGHT"
        : "UNEXPECTED",
      reasons.length ? [...new Set(reasons)].join("; ") : "—",
    ],
    expectedOutcome,
  };
}

export function main(args = process.argv.slice(2)) {
  if (args.some((arg) => arg !== "--offline"))
    throw new Error("usage: npm run demo [-- --offline]");
  let online = !args.includes("--offline");
  let results = runCases(online);
  if (online && (results === null || results.some(networkUnavailable))) {
    online = false;
    results = runCases(false);
  }
  if (!Array.isArray(results) || results.length !== cases.length)
    throw new Error("verifier returned an incomplete case set");
  const rows = cases.map((caseInfo, index) => {
    if (results[index].file !== caseInfo.file)
      throw new Error(`verifier returned an unexpected case at ${index}`);
    return reportRow(caseInfo, results[index], online);
  });
  console.log(
    "Expected quote: bundled genuine receipt; oracle and stored-record columns use read-only RPC when available.",
  );
  console.log(
    "| Case | Local check | Issued quote | Oracle round | Stored record | Verdict | Reason |",
  );
  console.log("| --- | --- | --- | --- | --- | --- | --- |");
  for (const row of rows) console.log(`| ${row.cells.map(cell).join(" | ")} |`);
  console.log(
    "Three layers: arithmetic (local), comparison with the issued quote, and on-chain records (oracle round + registry).",
  );
  if (rows.some((row) => !row.expectedOutcome)) process.exitCode = 1;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
