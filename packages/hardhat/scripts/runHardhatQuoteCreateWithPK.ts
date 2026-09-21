import * as dotenv from "dotenv";
dotenv.config();
import { JsonRpcProvider, Wallet } from "ethers";
import password from "@inquirer/password";
import { spawn } from "child_process";

const HEDERA_TESTNET_CHAIN_ID = 296n;
const HEDERA_TESTNET_RPC_URL = "https://testnet.hashio.io/api";

export function validateQuoteCreateNetwork(network: string | undefined): string {
  if (network !== "hederaTestnet") {
    throw new Error("QuoteProof receipt creation is testnet-only; use --network hederaTestnet");
  }
  return network;
}

function getArgument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function assertHederaTestnetProvider(): Promise<void> {
  const provider = new JsonRpcProvider(process.env.HEDERA_RPC_URL ?? HEDERA_TESTNET_RPC_URL);
  const network = await provider.getNetwork();
  if (network.chainId !== HEDERA_TESTNET_CHAIN_ID) {
    throw new Error(`QuoteProof receipt creation requires chain ID 296; provider reported ${network.chainId}`);
  }
}

function clearRuntimePrivateKey(): void {
  delete process.env.__RUNTIME_DEPLOYER_PRIVATE_KEY;
}

async function main() {
  validateQuoteCreateNetwork(getArgument("--network"));
  await assertHederaTestnetProvider();

  const encryptedKey = process.env.DEPLOYER_PRIVATE_KEY_ENCRYPTED;
  if (!encryptedKey) {
    console.log("🚫️ No encrypted deployer account is configured. Run `npm run account:import` first.");
    process.exitCode = 1;
    return;
  }

  const pass = await password({ message: "Enter password to decrypt private key:" });
  let privateKey: string;
  try {
    const wallet = await Wallet.fromEncryptedJson(encryptedKey, pass);
    privateKey = wallet.privateKey;
  } catch {
    console.error("Failed to decrypt private key. Wrong password?");
    process.exitCode = 1;
    return;
  }

  process.env.__RUNTIME_DEPLOYER_PRIVATE_KEY = privateKey;
  const forwardedArgs: string[] = [];
  const rawArgs = process.argv.slice(2);
  for (let index = 0; index < rawArgs.length; index += 1) {
    const argument = rawArgs[index];
    if (argument === "--cents" || argument === "--output") {
      const value = rawArgs[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value`);
      process.env[argument === "--cents" ? "QUOTE_CENTS" : "QUOTE_OUTPUT"] = value;
      index += 1;
    } else {
      forwardedArgs.push(argument);
    }
  }

  const args = ["run", "scripts/createQuoteProof.ts", ...forwardedArgs];
  const hardhatExecutable = process.platform === "win32" ? "hardhat.cmd" : "hardhat";
  const hardhat = spawn(hardhatExecutable, args, {
    stdio: "inherit",
    env: process.env,
    shell: false,
  });

  hardhat.on("exit", code => {
    clearRuntimePrivateKey();
    process.exitCode = code ?? 1;
  });
}

process.on("exit", clearRuntimePrivateKey);

if (require.main === module) {
  main().catch(error => {
    clearRuntimePrivateKey();
    console.error(error);
    process.exitCode = 1;
  });
}
