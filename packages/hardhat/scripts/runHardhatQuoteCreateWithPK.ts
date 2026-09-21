import * as dotenv from "dotenv";
dotenv.config();
import { Wallet } from "ethers";
import password from "@inquirer/password";
import { spawn } from "child_process";

async function main() {
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
      if (!value) throw new Error(`${argument} requires a value`);
      process.env[argument === "--cents" ? "QUOTE_CENTS" : "QUOTE_OUTPUT"] = value;
      index += 1;
    } else {
      forwardedArgs.push(argument);
    }
  }

  const args = ["run", "scripts/createQuoteProof.ts", ...forwardedArgs];
  const hardhat = spawn("hardhat", args, {
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });

  hardhat.on("exit", code => {
    process.exit(code ?? 1);
  });
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
