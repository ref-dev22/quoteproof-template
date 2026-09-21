import * as dotenv from "dotenv";
dotenv.config();
import { Wallet } from "ethers";
import password from "@inquirer/password";
import { spawn } from "child_process";

function getArgument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function runHardhat(args: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn("hardhat", args, {
      stdio: "inherit",
      env: process.env,
      shell: process.platform === "win32",
    });
    child.on("error", reject);
    child.on("exit", code => resolve(code ?? 1));
  });
}

async function main() {
  const network = getArgument("--network") ?? "hederaTestnet";
  if (network !== "hederaTestnet") throw new Error("QuoteProof E2E is testnet-only; use --network hederaTestnet");

  const cents = getArgument("--cents");
  if (!cents || !/^(0|[1-9][0-9]*)$/.test(cents)) {
    throw new Error("QuoteProof E2E requires --cents as a decimal integer string");
  }
  const output = getArgument("--output");
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

  const deployCode = await runHardhat(["deploy", "--network", network, "--tags", "QuoteProof"]);
  if (deployCode !== 0) {
    process.exitCode = deployCode;
    return;
  }

  process.env.QUOTE_CENTS = cents;
  if (output) process.env.QUOTE_OUTPUT = output;
  const createCode = await runHardhat(["run", "scripts/createQuoteProof.ts", "--network", network]);
  process.exitCode = createCode;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
