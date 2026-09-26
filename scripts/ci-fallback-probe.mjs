// CI-only observer. Never repairs the generated project or retries a command.
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = process.env.PROBE_ROOT;
if (!root) throw new Error("PROBE_ROOT is required");
const app = path.join(root, "probe");
const evidence = path.join(root, "evidence");
fs.mkdirSync(evidence, { recursive: true });
// No GitHub credential is allowed to influence the creator's manifest fetch.
for (const key of ["GITHUB_TOKEN", "GH_TOKEN", "GIGET_AUTH", "GITHUB_API_TOKEN"]) delete process.env[key];
const read = file => fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
const json = file => JSON.parse(read(file) || "null");
const save = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
const redact = text => text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "")
  .replace(/(?:Bearer\s+|(?:token|password|secret|api[_-]?key)\s*[:=]\s*)[^\s"']+/gi, "[REDACTED]")
  .replace(/[A-Za-z0-9_=-]{32,}/g, "[REDACTED]");
const firstError = text => (redact(text).split(/\r?\n/).map(s => s.trim()).filter(s => !/^npm warn\b/i.test(s)).find(s =>
  /error|failed|failure|invalid|cannot|could not|not found|can't resolve|YN000[19]|YN0028|ERR!/i.test(s)) || "No error line emitted (see log)").slice(0, 400);
const statusCode = result => result.status ?? (result.error?.code === "ETIMEDOUT" ? 124 : result.signal ? 128 : 127);
function record(step, code, command, log, note = "") {
  const text = redact(log);
  const row = { step, result: code === 0 ? "PASS" : "FAIL", exitCode: code, command,
    firstError: code === 0 ? "—" : firstError(text), note };
  save(path.join(evidence, `${step}.json`), row);
  fs.writeFileSync(path.join(evidence, `${step}.log`), text);
  console.log(JSON.stringify(row));
  return code;
}
function run(step, command, args, cwd = app, seconds = 300) {
  const logPath = path.join(root, `${step}.raw.log`);
  const fd = fs.openSync(logPath, "w");
  const result = spawnSync("timeout", ["--kill-after=15s", `${seconds}s`, command, ...args],
    { cwd, env: { ...process.env, PROBE_PHASE: step }, stdio: ["ignore", fd, fd] });
  fs.closeSync(fd);
  const log = read(logPath) + (result.error ? `\n${result.error.message}\n` : "");
  return record(step, statusCode(result), [command, ...args].join(" "), log);
}
function manager() {
  const selected = selectedManager();
  if (!["npm", "yarn"].includes(selected)) throw new Error(`Unknown selected package manager: ${selected}`);
  return selected;
}
function selectedManager() {
  const attempt = json(path.join(root, "install-attempt.json"));
  return attempt?.command.split(" ")[0] ?? read(path.join(root, "scaffold.raw.log")).match(/Installing dependencies with (npm|yarn)/)?.[1];
}
function scriptArgs(name, extra = []) {
  return manager() === "npm" ? ["run", name, ...(extra.length ? ["--", ...extra] : [])] : [name, ...extra];
}
const action = process.argv[2];
let code = 0;
try {
if (action === "observe") {
  const pm = process.argv[3];
  const args = process.argv.slice(4);
  const binary = read(path.join(root, `${pm}-path`)).trim();
  // CLI 0.4.0 validates forge only after selecting Foundry, before creating files.
  // Record that observation separately from directory presence (the template has no Foundry package).
  if (pm === "forge" && args[0] === "--version" && process.env.PROBE_PHASE === "scaffold") {
    save(path.join(root, "framework-selection.json"), { selected: "foundry", evidence: "CLI invoked forge --version during scaffold preflight" });
  }
  const installing = process.cwd() === app && args[0] === "install";
  if (installing) {
    save(path.join(root, "install-attempt.json"), { command: [pm, ...args].join(" "), exitCode: null });
    const fd = fs.openSync(path.join(root, "cli-install.raw.log"), "w");
    const result = spawnSync(binary, args, { stdio: ["inherit", fd, fd], env: process.env });
    fs.closeSync(fd);
    code = statusCode(result);
    save(path.join(root, "install-attempt.json"), { command: [pm, ...args].join(" "), exitCode: code });
    process.stdout.write(read(path.join(root, "cli-install.raw.log")));
  } else {
    code = statusCode(spawnSync(binary, args, { stdio: "inherit", env: process.env }));
  }
} else if (action === "scaffold") {
  code = run(action, "npm", ["create", "scaffold-hbar@latest", "--", "probe", "--template", "ref-dev22/quoteproof-template", "--ci"], root, 900);
} else if (action === "install") {
  const attempt = json(path.join(root, "install-attempt.json"));
  if (attempt) {
    code = record(action, attempt.exitCode ?? 124, attempt.command, read(path.join(root, "cli-install.raw.log")),
      "Observed inside scaffold; not rerun. Null child exit means interrupted before completion (124).");
  } else {
    code = run(action, manager(), ["install"], app, 900);
  }
} else if (action === "lint" || action === "build") {
  code = run(action, manager(), scriptArgs(action === "lint" ? "lint" : "next:build"), app, 600);
} else if (action === "serve") {
  const child = spawn(manager(), scriptArgs("next:dev", ["--hostname", "127.0.0.1", "--port", "3000"]),
    { cwd: app, stdio: "inherit", env: process.env });
  child.on("error", error => { console.error(error.message); fs.writeFileSync(path.join(root, "app.exit"), "127"); });
  child.on("exit", (status, signal) => fs.writeFileSync(path.join(root, "app.exit"), String(status ?? (signal ? 128 : 127))));
} else if (action === "start") {
  const command = [manager(), ...scriptArgs("next:dev", ["--hostname", "127.0.0.1", "--port", "3000"])].join(" ");
  const fd = fs.openSync(path.join(root, "app.raw.log"), "w");
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "serve"],
    { detached: true, stdio: ["ignore", fd, fd], env: process.env });
  fs.closeSync(fd);
  fs.writeFileSync(path.join(root, "app.pid"), String(child.pid));
  child.unref();
  let ready = false;
  for (let i = 0; i < 120; i++) {
    if (fs.existsSync(path.join(root, "app.exit"))) break;
    ready = await new Promise(resolve => {
      const socket = net.connect(3000, "127.0.0.1");
      socket.setTimeout(500);
      socket.once("connect", () => { socket.destroy(); resolve(true); });
      socket.once("error", () => resolve(false));
      socket.once("timeout", () => { socket.destroy(); resolve(false); });
    });
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  code = record(action, ready ? 0 : (Number(read(path.join(root, "app.exit")) || 124) || 1), command,
    read(path.join(root, "app.raw.log")) + (ready ? "" : "\nApp failed to listen within 120 seconds\n"),
    "Exit 0 means TCP readiness; page compilation is measured by the separate GET steps. Development server, not production serve.");
} else if (action === "home" || action === "preview") {
  const url = `http://127.0.0.1:3000${action === "home" ? "/" : "/api/quote/preview?cents=100"}`;
  const before = read(path.join(root, "app.raw.log")).length;
  code = run(action, "curl", ["--silent", "--show-error", "--fail-with-body", "--max-time", "120", "--write-out", "\nHTTP %{http_code}\n", url], root, 130);
  const row = json(path.join(evidence, `${action}.json`));
  code = record(action, code, row.command, read(path.join(root, `${action}.raw.log`)) +
    "\nServer output during request:\n" + read(path.join(root, "app.raw.log")).slice(before));
} else if (action === "report") {
  const pkg = json(path.join(app, "package.json"));
  const selection = json(path.join(root, "framework-selection.json"));
  const facts = { selectedPackageManager: selectedManager() ?? "unknown", declaredPackageManager: pkg?.packageManager ?? "unknown", hardhatExists: fs.existsSync(path.join(app, "packages/hardhat")),
    foundryExists: fs.existsSync(path.join(app, "packages/foundry")), ethersResolvableFromNextjs: false };
  facts.framework = selection?.selected ?? (facts.hardhatExists ? "hardhat" : facts.foundryExists ? "foundry" : "unknown");
  facts.frameworkEvidence = selection?.evidence ?? "Directory presence only; no Foundry preflight observed";
  if (pkg) {
    const resolver = "console.log(require.resolve('ethers', {paths: [process.cwd() + '/packages/nextjs']}))";
    const pnp = path.join(app, ".pnp.cjs");
    const result = spawnSync(process.execPath, [...(fs.existsSync(pnp) ? ["--require", pnp] : []), "-e", resolver],
      { cwd: app, encoding: "utf8", timeout: 30000 });
    facts.ethersResolvableFromNextjs = result.status === 0;
    fs.writeFileSync(path.join(evidence, "ethers.log"), redact((result.stdout || "") + (result.stderr || "")));
    fs.writeFileSync(path.join(evidence, "generated-package.json"), redact(JSON.stringify(pkg, null, 2)));
  }
  save(path.join(evidence, "facts.json"), facts);
  for (const name of ["toolchain", "api-check", "app.raw"]) fs.writeFileSync(path.join(evidence, `${name}.log`), redact(read(path.join(root, `${name}.log`))));
  const rows = ["scaffold", "install", "lint", "build", "start", "home", "preview"].map(step =>
    json(path.join(evidence, `${step}.json`)) ?? { step, result: "NOT MEASURED", exitCode: null, firstError: "Step did not produce a result; inspect setup/runner logs", command: "" });
  const cell = value => String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
  const summary = `## Manifest-unavailable fallback probe (advisory)\n\n${redact(read(path.join(root, "toolchain.log")))}\n\n` +
    `CLI selected package manager: ${facts.selectedPackageManager}; generated manifest declares: ${facts.declaredPackageManager}; selected framework: ${facts.framework} (${facts.frameworkEvidence}); packages/hardhat exists: ${facts.hardhatExists}; packages/foundry exists: ${facts.foundryExists}; ethers resolves from Next.js: ${facts.ethersResolvableFromNextjs}.\n\n` +
    "| step | result (exit code) | first error |\n|---|---|---|\n" +
    rows.map(r => `| ${r.step} | ${r.result} (${r.exitCode ?? "n/a"}) | ${cell(r.firstError)} |`).join("\n") +
    "\n\nExact commands and observations:\n\n" + rows.map(r => `- ${r.step}: \`${cell(r.command)}\`. ${r.note || ""}`).join("\n") +
    "\n\nNo failed command was repaired or retried. A green advisory job is not a gate pass. GET preview may perform read-only Testnet RPC; no wallet, deployment, HCS write, faucet, or secret is used.\n";
  fs.writeFileSync(path.join(evidence, "report.md"), summary);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  console.log(summary);
} else {
  throw new Error(`Unknown measurement: ${action}`);
}
} catch (error) {
  code = record(action, 1, `node scripts/ci-fallback-probe.mjs ${action}`, `Measurement failed: ${error.message}`,
    "Harness/precondition failure; no substitute command or repair attempted.");
}
process.exitCode = code;
