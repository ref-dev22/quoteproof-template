import fs from "node:fs";
import path from "node:path";
import { parseReceiptJson, verifyReceiptObject } from "../utils/quoteReceipt";
import { compareExpectedQuote } from "../utils/quoteReceiptComparison";
import { runReadOnlyComparison } from "./verifyQuote";

const fixtures = process.env.DEMO_FIXTURES_DIR
  ? path.resolve(process.env.DEMO_FIXTURES_DIR)
  : path.resolve(__dirname, "../../../examples/adversarial");
const files = [
  "genuine.json",
  "simple-tamper-tinybars-plus-one.json",
  "recomputed-cents-1000.json",
  "recomputed-double-price.json",
];

async function main(): Promise<void> {
  const genuine = parseReceiptJson(fs.readFileSync(path.join(fixtures, files[0]), "utf8"));
  const options = {
    expectedChainId: BigInt(genuine.chainId),
    expectedRegistry: genuine.registry,
    expectedOracle: genuine.oracle,
  };
  const expected = { commitment: genuine.commitment, issuer: genuine.issuer, nonce: genuine.nonce };
  const online = process.argv.includes("--online");
  const results = [];
  for (const file of files) {
    const receipt = parseReceiptJson(fs.readFileSync(path.join(fixtures, file), "utf8"));
    const local = verifyReceiptObject(receipt, options);
    const comparison =
      online && local.valid
        ? await runReadOnlyComparison(receipt, options, process.env.HEDERA_RPC_URL ?? "https://testnet.hashio.io/api")
        : {
            historicalOracle: { status: "not_checked", requestedRoundId: receipt.roundId },
            recordedComparison: { status: "not_run" },
          };
    results.push({
      file,
      localConsistency: { status: local.valid ? "valid" : "invalid", errors: local.errors },
      expectedQuote: compareExpectedQuote(receipt, expected),
      ...comparison,
    });
  }
  console.log(JSON.stringify(results));
}

void main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
