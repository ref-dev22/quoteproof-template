import * as dotenv from "dotenv";
dotenv.config();
import fs from "node:fs";
import { deployments, ethers } from "hardhat";
import { FEED_ID } from "../utils/quoteReceipt";

const HEDERA_TESTNET_CHAIN_ID = 296n;
const MIN_CENTS = 1n;
const MAX_CENTS = 100_000_000n;

function getArgument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function parseCents(): bigint {
  const value = getArgument("--cents") ?? process.env.QUOTE_CENTS;
  if (!value || !/^(0|[1-9][0-9]*)$/.test(value)) throw new Error("--cents must be a decimal integer string");
  const cents = BigInt(value);
  if (cents < MIN_CENTS || cents > MAX_CENTS) throw new Error("--cents is outside the supported bounds");
  return cents;
}

async function main() {
  const network = await ethers.provider.getNetwork();
  if (network.chainId !== HEDERA_TESTNET_CHAIN_ID) {
    throw new Error(`QuoteProof receipt creation requires chain ID 296; provider reported ${network.chainId}`);
  }
  if (!process.env.__RUNTIME_DEPLOYER_PRIVATE_KEY) {
    throw new Error("QuoteProof receipt creation requires the interactive encrypted-account wrapper");
  }

  const deployment = await deployments.get("QuoteProofRegistry");
  const signer = (await ethers.getSigners())[0];
  const registry = await ethers.getContractAt("QuoteProofRegistry", deployment.address, signer);
  const cents = parseCents();
  const preview = await registry.previewQuote(cents);

  const transaction = await registry.createQuote(cents, preview.roundId, preview.nonce);
  const confirmed = await transaction.wait();
  if (!confirmed || confirmed.status !== 1)
    throw new Error("QuoteProof receipt transaction did not confirm successfully");

  const block = await ethers.provider.getBlock(confirmed.blockNumber);
  if (!block) throw new Error("Confirmed block could not be retrieved");
  const issuer = await signer.getAddress();
  const commitment = await registry.getCommitment(issuer, preview.nonce);
  const receipt = {
    schemaVersion: (await registry.SCHEMA_VERSION()).toString(),
    chainId: network.chainId.toString(),
    registry: deployment.address,
    issuer,
    nonce: preview.nonce.toString(),
    cents: cents.toString(),
    oracle: await registry.oracle(),
    feedId: FEED_ID,
    roundId: preview.roundId.toString(),
    price: preview.price.toString(),
    decimals: preview.decimals.toString(),
    observedAt: preview.observedAt.toString(),
    recordedAt: block.timestamp.toString(),
    maximumAge: (await registry.maxAge()).toString(),
    tinybars: preview.tinybars.toString(),
    commitment,
  };
  const outputPath = getArgument("--output") ?? process.env.QUOTE_OUTPUT;
  if (outputPath) fs.writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        chainId: network.chainId.toString(),
        registry: deployment.address,
        transactionHash: confirmed.hash,
        blockNumber: confirmed.blockNumber,
        receipt,
        outputPath: outputPath ?? null,
      },
      null,
      2,
    ),
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
