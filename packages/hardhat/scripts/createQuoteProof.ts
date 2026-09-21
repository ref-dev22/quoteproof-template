import * as dotenv from "dotenv";
dotenv.config();
import fs from "node:fs";
import { deployments, ethers } from "hardhat";
import { computeReceiptCommitment, verifyReceiptObject, type QuoteReceiptJson } from "../utils/quoteReceipt";

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

  const issuer = await signer.getAddress();
  const quoteEvent = confirmed.logs
    .map(log => {
      if (log.address.toLowerCase() !== deployment.address.toLowerCase()) return null;
      try {
        return registry.interface.parseLog({ topics: [...log.topics], data: log.data });
      } catch {
        return null;
      }
    })
    .find(event => event?.name === "QuoteRecorded");
  if (!quoteEvent) throw new Error("Confirmed receipt did not contain a QuoteRecorded event");

  const eventCommitment = String(quoteEvent.args[0]);
  const quote = quoteEvent.args[1] as {
    schemaVersion: bigint;
    chainId: bigint;
    registry: string;
    issuer: string;
    nonce: bigint;
    cents: bigint;
    oracle: string;
    feedId: string;
    roundId: bigint;
    price: bigint;
    decimals: bigint;
    observedAt: bigint;
    recordedAt: bigint;
    maximumAge: bigint;
    tinybars: bigint;
  };
  const receipt: QuoteReceiptJson = {
    schemaVersion: quote.schemaVersion.toString(),
    chainId: quote.chainId.toString(),
    registry: quote.registry,
    issuer: quote.issuer,
    nonce: quote.nonce.toString(),
    cents: quote.cents.toString(),
    oracle: quote.oracle,
    feedId: quote.feedId,
    roundId: quote.roundId.toString(),
    price: quote.price.toString(),
    decimals: quote.decimals.toString(),
    observedAt: quote.observedAt.toString(),
    recordedAt: quote.recordedAt.toString(),
    maximumAge: quote.maximumAge.toString(),
    tinybars: quote.tinybars.toString(),
    commitment: eventCommitment,
  };
  const storedCommitment = await registry.getCommitment(issuer, quote.nonce);
  if (storedCommitment.toLowerCase() !== eventCommitment.toLowerCase()) {
    throw new Error("Stored commitment does not match the QuoteRecorded event");
  }
  if (!(await registry.isStoredCommitment(issuer, quote.nonce, eventCommitment))) {
    throw new Error("Confirmed receipt commitment was not stored for the issuer and nonce");
  }
  if (computeReceiptCommitment(receipt).toLowerCase() !== eventCommitment.toLowerCase()) {
    throw new Error("QuoteRecorded event does not match the standalone receipt commitment");
  }
  const verification = verifyReceiptObject(receipt, {
    expectedChainId: network.chainId,
    expectedRegistry: deployment.address,
    expectedOracle: await registry.oracle(),
    expectedIssuer: issuer,
  });
  if (!verification.valid) {
    throw new Error(`Generated receipt failed standalone verification: ${verification.errors.join("; ")}`);
  }

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
