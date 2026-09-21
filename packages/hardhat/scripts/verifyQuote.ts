import fs from "node:fs";
import process from "node:process";
import { parseReceiptJson, verifyReceiptObject } from "../utils/quoteReceipt";

function getArgument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function main(): void {
  const inputPath = getArgument("--input");
  if (!inputPath) throw new Error("usage: npm run verify:quote -- --input <receipt.json> [--expected-chain-id <id>]");

  const raw = fs.readFileSync(inputPath, "utf8");
  const receipt = parseReceiptJson(raw);
  const expectedChainIdText = getArgument("--expected-chain-id");
  const expectedChainId = expectedChainIdText === undefined ? undefined : BigInt(expectedChainIdText);
  const result = verifyReceiptObject(receipt, {
    expectedChainId,
    expectedRegistry: getArgument("--expected-registry"),
    expectedOracle: getArgument("--expected-oracle"),
    expectedIssuer: getArgument("--expected-issuer"),
  });
  console.log(JSON.stringify(result, null, 2));
  if (!result.valid) process.exitCode = 2;
}

main();
