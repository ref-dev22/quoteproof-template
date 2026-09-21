import * as dotenv from "dotenv";
dotenv.config();
import fs from "node:fs";
import path from "node:path";
import { Wallet } from "ethers";
import password from "@inquirer/password";
import { spawn } from "child_process";

function getArgument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function runHardhat(args: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const hardhatExecutable = process.platform === "win32" ? "hardhat.cmd" : "hardhat";
    const child = spawn(hardhatExecutable, args, {
      stdio: "inherit",
      env: process.env,
      shell: false,
    });
    child.on("error", reject);
    child.on("exit", code => resolve(code ?? 1));
  });
}

function clearRuntimePrivateKey(): void {
  delete process.env.__RUNTIME_DEPLOYER_PRIVATE_KEY;
}

function deploymentArtifactPath(network: string): string {
  return path.resolve(__dirname, "..", "deployments", network, "QuoteProofRegistry.json");
}

async function main() {
  const network = getArgument("--network") ?? "hederaTestnet";
  if (network !== "hederaTestnet") throw new Error("QuoteProof E2E is testnet-only; use --network hederaTestnet");

  const cents = getArgument("--cents");
  if (!cents || !/^(0|[1-9][0-9]*)$/.test(cents)) {
    throw new Error("QuoteProof E2E requires --cents as a decimal integer string");
  }
  const output = getArgument("--output");
  if (output === "--reuse-deployment") throw new Error("--output requires a value");
  const encryptedKey = process.env.DEPLOYER_PRIVATE_KEY_ENCRYPTED;
  if (!encryptedKey) {
    console.log("🚫️ No encrypted deployer account is configured. Run `npm run account:import` first.");
    process.exitCode = 1;
    return;
  }

  const pass = await password({ message: "Enter password to decrypt private key for deploy + receipt: " });
  try {
    const wallet = await Wallet.fromEncryptedJson(encryptedKey, pass);
    process.env.__RUNTIME_DEPLOYER_PRIVATE_KEY = wallet.privateKey;
  } catch {
    console.error("Failed to decrypt private key. Wrong password?");
    process.exitCode = 1;
    return;
  }

  const deploymentPath = deploymentArtifactPath(network);
  if (fs.existsSync(deploymentPath)) {
    console.log(`[quote:e2e] reusing existing QuoteProof deployment: ${deploymentPath}`);
  } else {
    console.log("[quote:e2e] deploying QuoteProof registry...");
    const deployCode = await runHardhat(["deploy", "--network", network, "--tags", "QuoteProof"]);
    if (deployCode !== 0) {
      console.error(`[quote:e2e] deployment stage exited with code ${deployCode}`);
      process.exitCode = deployCode;
      return;
    }
  }

  process.env.QUOTE_CENTS = cents;
  if (output) process.env.QUOTE_OUTPUT = output;
  console.log("[quote:e2e] creating and verifying QuoteProof receipt...");
  const createCode = await runHardhat(["run", "scripts/createQuoteProof.ts", "--network", network]);
  if (createCode !== 0) console.error(`[quote:e2e] receipt stage exited with code ${createCode}`);
  clearRuntimePrivateKey();
  process.exitCode = createCode;
}

process.on("exit", clearRuntimePrivateKey);

main().catch(error => {
  clearRuntimePrivateKey();
  console.error(error);
  process.exitCode = 1;
});
