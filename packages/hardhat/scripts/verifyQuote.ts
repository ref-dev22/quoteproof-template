import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  parseReceiptJson,
  verifyReceiptObject,
  type VerificationOptions,
  type VerificationResult,
} from "../utils/quoteReceipt";

const HEDERA_TESTNET_CHAIN_ID = 296n;

function getArgument(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

function hasFlag(args: readonly string[], name: string): boolean {
  return args.includes(name);
}

function parseChainId(value: string): bigint {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) throw new Error("--expected-chain-id must be a decimal integer string");
  return BigInt(value);
}

function loadHederaTestnetDeployment(): { registry: string; oracle: string } {
  const candidates = [
    path.resolve(__dirname, "..", "deployments", "hederaTestnet", "QuoteProofRegistry.json"),
    path.resolve(process.cwd(), "deployments", "hederaTestnet", "QuoteProofRegistry.json"),
  ];
  const deploymentPath = candidates.find(candidate => fs.existsSync(candidate));
  if (!deploymentPath) {
    throw new Error(
      "hederaTestnet QuoteProofRegistry deployment artifact is required; pass --expected-registry and --expected-oracle or use --allow-foreign-context",
    );
  }
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8")) as {
    address?: unknown;
    args?: unknown[];
  };
  const registry = deployment.address;
  const oracle = deployment.args?.[0];
  if (typeof registry !== "string" || typeof oracle !== "string") {
    throw new Error(
      `deployment artifact is missing the QuoteProofRegistry address or oracle argument: ${deploymentPath}`,
    );
  }
  return { registry, oracle };
}

export function resolveVerificationOptions(args: readonly string[] = process.argv.slice(2)): VerificationOptions {
  const allowForeignContext = hasFlag(args, "--allow-foreign-context");
  const expectedChainIdText = getArgument(args, "--expected-chain-id");
  const expectedChainId =
    expectedChainIdText === undefined
      ? allowForeignContext
        ? undefined
        : HEDERA_TESTNET_CHAIN_ID
      : parseChainId(expectedChainIdText);
  let expectedRegistry = getArgument(args, "--expected-registry");
  let expectedOracle = getArgument(args, "--expected-oracle");

  if (!allowForeignContext && (expectedRegistry === undefined || expectedOracle === undefined)) {
    const deployment = loadHederaTestnetDeployment();
    expectedRegistry ??= deployment.registry;
    expectedOracle ??= deployment.oracle;
  }

  return {
    expectedChainId,
    expectedRegistry,
    expectedOracle,
    expectedIssuer: getArgument(args, "--expected-issuer"),
  };
}

function invalidResult(error: unknown): VerificationResult {
  return {
    valid: false,
    level: "invalid",
    errors: [error instanceof Error ? error.message : String(error)],
    onChainVerified: false,
    checks: {
      expectedChainId: false,
      expectedRegistry: false,
      expectedOracle: false,
      expectedIssuer: false,
      feedId: false,
      arithmetic: false,
      commitment: false,
    },
  };
}

export function main(args: readonly string[] = process.argv.slice(2)): void {
  const inputPath = getArgument(args, "--input");
  if (!inputPath) throw new Error("usage: npm run verify:quote -- --input <receipt.json> [--expected-chain-id <id>]");

  const raw = fs.readFileSync(inputPath, "utf8");
  const receipt = parseReceiptJson(raw);
  const result = verifyReceiptObject(receipt, resolveVerificationOptions(args));
  console.log(JSON.stringify(result, null, 2));
  if (!result.valid) process.exitCode = 2;
}

try {
  if (require.main === module) main();
} catch (error) {
  console.log(JSON.stringify(invalidResult(error), null, 2));
  process.exitCode = 2;
}
