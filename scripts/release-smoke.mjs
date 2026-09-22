import { readFile } from "node:fs/promises";

const baseUrl = process.env.RELEASE_SMOKE_BASE_URL || "http://127.0.0.1:3002";
const requestTimeoutMs = 30_000;
const receipt = JSON.parse(await readFile(new URL("../examples/receipt-testnet.json", import.meta.url), "utf8"));
const results = [];

function summarize(body) {
  if (body && typeof body === "object") {
    return {
      fields: Object.keys(body),
      localConsistency: body.localConsistency?.status,
      historicalOracle: body.historicalOracle?.status,
      recordedComparison: body.recordedComparison?.status,
      error: body.error,
    };
  }
  return { textBytes: typeof body === "string" ? body.length : 0 };
}

async function check(name, path, options, assertion) {
  const startedAt = Date.now();
  try {
    const response = await fetch(new URL(path, `${baseUrl}/`), {
      ...options,
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    const contentType = response.headers.get("content-type") || "";
    const body = contentType.includes("application/json") ? await response.json() : await response.text();
    const passed = Boolean(assertion(response.status, body));
    results.push({ name, status: response.status, passed, durationMs: Date.now() - startedAt, ...summarize(body) });
  } catch (error) {
    results.push({ name, passed: false, durationMs: Date.now() - startedAt, error: String(error) });
  }
}

const jsonPost = value => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ receipt: value }),
});

await check("homepage", "/", {}, (status, body) => status === 200 && body.includes("QuoteProof"));
await check(
  "preview",
  "/api/quote/preview?cents=100",
  {},
  (status, body) =>
    status === 200 &&
    ["nonce", "roundId", "price", "decimals", "observedAt", "tinybars"].every(key => typeof body[key] === "string"),
);
await check("zero cents rejected", "/api/quote/preview?cents=0", {}, status => status === 400);
await check("oversized amount rejected", "/api/quote/preview?cents=100000001", {}, status => status === 400);
await check(
  "genuine receipt comparison",
  "/api/quote/compare",
  jsonPost(receipt),
  (status, body) =>
    status === 200 &&
    body.localConsistency?.status === "valid" &&
    body.historicalOracle?.status === "match" &&
    body.recordedComparison?.status === "match",
);
await check(
  "altered receipt rejected",
  "/api/quote/compare",
  jsonPost({ ...receipt, cents: "1000" }),
  (status, body) => status === 200 && body.localConsistency?.status === "invalid" && body.recordedComparison?.status === "not_run",
);

const report = { observedUtc: new Date().toISOString(), baseUrl, results };
console.log(JSON.stringify(report, null, 2));
if (results.some(result => !result.passed)) process.exitCode = 1;
