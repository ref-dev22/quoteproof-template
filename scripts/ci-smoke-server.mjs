import { spawn } from "node:child_process";
import { closeSync, createWriteStream, existsSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const [mode] = process.argv.slice(2);
if (!(mode === "production" || mode === "dev") || !process.env.RUNNER_TEMP || !process.env.GITHUB_WORKSPACE) {
  throw new Error("Usage: node scripts/ci-smoke-server.mjs <production|dev> (in GitHub Actions)");
}
const logDirectory = resolve(process.env.RUNNER_TEMP, "quoteproof-external-scaffold", "logs");

const started = Date.now();
const windows = process.platform === "win32";
const timings = {};
const log = (stage, durationMs) => {
  timings[stage] = durationMs;
  console.log(`CI_TIMING ${mode} ${stage}=${durationMs}ms`);
};

async function freePort() {
  const server = createServer();
  await new Promise((resolveReady, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveReady);
  });
  const port = server.address().port;
  await new Promise(resolveClosed => server.close(resolveClosed));
  return port;
}

async function waitForHttp200(url, timeoutMs, requestTimeoutMs, child) {
  const begin = Date.now();
  let lastResult = "no response";
  while (Date.now() - begin < timeoutMs) {
    if (child.exitCode !== null) throw new Error(`server exited early with code ${child.exitCode}`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(requestTimeoutMs) });
      await response.body?.cancel();
      if (response.status === 200) return Date.now() - begin;
      lastResult = `HTTP ${response.status}`;
    } catch (error) {
      // Compilation and startup can reject requests before the server is ready.
      lastResult = error instanceof Error ? error.message : String(error);
    }
    await delay(mode === "dev" ? 2000 : 1000);
  }
  throw new Error(`GET ${url} did not return 200 within ${timeoutMs / 1000} seconds (last: ${lastResult})`);
}

async function runReleaseSmoke(baseUrl) {
  const logPath = resolve(logDirectory, "smoke.log");
  const output = createWriteStream(logPath);
  const script = resolve(process.env.GITHUB_WORKSPACE, "scripts/release-smoke.mjs");
  const child = spawn(process.execPath, [script], {
    cwd: process.cwd(),
    env: { ...process.env, RELEASE_SMOKE_BASE_URL: baseUrl },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  for (const stream of [child.stdout, child.stderr]) {
    stream.on("data", chunk => {
      output.write(chunk);
      process.stdout.write(chunk);
    });
  }
  const exitCode = await new Promise((resolveExit, reject) => {
    child.once("error", reject);
    child.once("close", resolveExit);
  });
  await new Promise(resolveDone => output.end(resolveDone));
  if (exitCode !== 0) throw new Error(`release-smoke.mjs exited with code ${exitCode}`);
}

async function stopTree(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  if (windows) {
    const killer = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let details = "";
    killer.stderr.on("data", chunk => (details += chunk));
    const timeout = new AbortController();
    let result;
    try {
      result = await Promise.race([
        new Promise((resolveExit, reject) => {
          killer.once("error", reject);
          killer.once("close", code => resolveExit({ code }));
        }),
        delay(10_000, { code: -1 }, { signal: timeout.signal }),
      ]);
    } finally {
      timeout.abort();
    }
    if (result.code !== 0) {
      killer.kill();
      child.kill("SIGKILL");
      if (child.exitCode === null && child.signalCode === null) {
        throw new Error(`taskkill failed with code ${result.code}: ${details.trim()}`);
      }
    }
  } else {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  }
  if (child.exitCode === null && child.signalCode === null) {
    const timeout = new AbortController();
    try {
      const closed = await Promise.race([
        new Promise(resolveExit => child.once("close", () => resolveExit(true))),
        delay(5_000, false, { signal: timeout.signal }),
      ]);
      if (!closed) child.kill("SIGKILL");
    } finally {
      timeout.abort();
    }
  }
}

let server;
let serverLogPath;
try {
  const port = mode === "production" ? 3002 : await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  serverLogPath = resolve(logDirectory, `${mode === "production" ? "production" : "dev"}-server.log`);
  const childEnv = { ...process.env };
  if (mode === "dev") {
    for (const name of ["HCS_TOPIC_ID", "HCS_OPERATOR_ID", "HCS_OPERATOR_KEY", "HCS_ANCHOR_TOKEN", "HCS_ANCHOR_DISABLED"]) {
      delete childEnv[name];
    }
    if (existsSync("packages/nextjs/.env.local")) throw new Error("README dev smoke must have no .env.local");
  }
  const args = ["run", mode === "production" ? "next:serve" : "next:dev", "--", "--hostname", mode === "production" ? "127.0.0.1" : "0.0.0.0", "--port", String(port)];
  const serverLogFd = openSync(serverLogPath, "w");
  try {
    server = spawn(windows ? "npm.cmd" : "npm", args, {
      cwd: process.cwd(),
      env: childEnv,
      shell: windows,
      detached: !windows,
      stdio: ["ignore", serverLogFd, serverLogFd],
      windowsHide: true,
    });
  } finally {
    closeSync(serverLogFd);
  }
  server.unref();
  server.once("error", error => console.error(`server launch error: ${error.message}`));

  const readyMs = await waitForHttp200(`${baseUrl}/`, mode === "dev" ? 300_000 : 60_000, mode === "dev" ? 5000 : 1000, server);
  log("server_ready", readyMs);
  if (mode === "production") {
    const assertionStart = Date.now();
    await runReleaseSmoke(baseUrl);
    log("assertions", Date.now() - assertionStart);
  } else {
    const previewStart = Date.now();
    // Cold route compilation and public Testnet reads can each outlast one short request.
    await waitForHttp200(`${baseUrl}/api/quote/preview?cents=100`, 180_000, 60_000, server);
    log("preview", Date.now() - previewStart);
    const hcsStart = Date.now();
    let hcsStatus = "unavailable";
    try {
      const receipt = JSON.parse(readFileSync(resolve("examples/receipt-testnet.json"), "utf8"));
      const response = await fetch(`${baseUrl}/api/quote/hcs/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          receipt,
          transactionHash: "0x076690438e81f96fc77f3f6467157d2f53c05703ef098790a42b82909a340ef9",
          logIndex: 0,
          topicId: "0.0.10698279",
          sequenceNumber: 1,
        }),
        signal: AbortSignal.timeout(30_000),
      });
      const data = await response.json();
      hcsStatus = data?.hcsAnchor?.status ?? `HTTP ${response.status} without status`;
    } catch (error) {
      hcsStatus = `unavailable (${error instanceof Error ? error.message : String(error)})`;
    }
    log("hcs_verify", Date.now() - hcsStart);
    console.log(`README dev historical HCS verify: ${hcsStatus}`);
    if (hcsStatus === "mismatch") throw new Error("README dev historical HCS verify returned mismatch");
    const result = `README dev GET /: 200\nREADME dev GET /api/quote/preview?cents=100: 200\nREADME dev historical HCS verify: ${hcsStatus}\n`;
    process.stdout.write(result);
    writeFileSync(resolve(logDirectory, "dev-smoke.log"), result);
  }
} catch (error) {
  console.error(`CI_SMOKE_ERROR ${mode}: ${error instanceof Error ? error.message : String(error)}`);
  if (serverLogPath && existsSync(serverLogPath)) {
    console.error(readFileSync(serverLogPath, "utf8").split("\n").slice(-80).join("\n"));
  }
  process.exitCode = 1;
} finally {
  const cleanupStart = Date.now();
  try {
    await stopTree(server);
  } catch (error) {
    console.error(`CI_CLEANUP_ERROR ${mode}: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
  log("cleanup", Date.now() - cleanupStart);
  log("total", Date.now() - started);
  writeFileSync(resolve(logDirectory, `${mode}-timing.json`), JSON.stringify(timings, null, 2) + "\n");
}
