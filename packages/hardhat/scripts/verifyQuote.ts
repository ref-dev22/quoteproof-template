import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { Contract, JsonRpcProvider } from "ethers";
import {
  parseReceiptJson,
  verifyReceiptObject,
  type VerificationOptions,
  type VerificationResult,
} from "../utils/quoteReceipt";
import {
  compareExpectedQuote,
  compareHistoricalOracle,
  compareStoredCommitment,
  type ExpectedQuoteComparison,
  type HistoricalOracleComparison,
} from "../utils/quoteReceiptComparison";

const HEDERA_TESTNET_CHAIN_ID = 296n;
const HEDERA_TESTNET_RPC_URL = "https://testnet.hashio.io/api";

type DirectStoredComparison =
  | { status: "match" | "mismatch" | "not_found"; storedCommitment: string }
  | { status: "wrong_network" | "provider_error" | "not_run"; error?: string; providerChainId?: string };

type DirectHistoricalOracle =
  HistoricalOracleComparison | { status: "unavailable" | "not_checked"; requestedRoundId: string; error?: string };

type ReadOnlyVerificationOutput = VerificationResult & {
  localConsistency: { status: "valid" | "invalid"; errors: string[] };
  expectedQuote: ExpectedQuoteComparison;
  historicalOracle: DirectHistoricalOracle;
  recordedComparison: DirectStoredComparison;
};

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

function hasAnyExpectedQuoteArgument(args: readonly string[]): boolean {
  return ["--expected-commitment", "--expected-issuer", "--expected-nonce"].some(name => args.includes(name));
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

function directNotChecked(roundId: string): DirectHistoricalOracle {
  return { status: "not_checked", requestedRoundId: roundId };
}

async function runReadOnlyComparison(
  receipt: Parameters<typeof compareExpectedQuote>[0],
  options: VerificationOptions,
  rpcUrl: string,
): Promise<{ historicalOracle: DirectHistoricalOracle; recordedComparison: DirectStoredComparison }> {
  if (options.expectedChainId === undefined || !options.expectedRegistry || !options.expectedOracle) {
    return {
      historicalOracle: directNotChecked(receipt.roundId),
      recordedComparison: { status: "not_run", error: "trusted chain, registry, and oracle context is required" },
    };
  }

  const provider = new JsonRpcProvider(rpcUrl);
  let providerChainId: bigint;
  try {
    providerChainId = (await provider.getNetwork()).chainId;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Reference provider failed";
    return {
      historicalOracle: { status: "unavailable", requestedRoundId: receipt.roundId, error: message },
      recordedComparison: { status: "provider_error", error: message },
    };
  }
  if (providerChainId !== options.expectedChainId) {
    return {
      historicalOracle: directNotChecked(receipt.roundId),
      recordedComparison: {
        status: "wrong_network",
        providerChainId: providerChainId.toString(),
        error: `Reference provider reported chainId ${providerChainId}; expected ${options.expectedChainId}`,
      },
    };
  }

  let recordedComparison: DirectStoredComparison;
  try {
    const registry = new Contract(
      options.expectedRegistry,
      [
        "function getCommitment(address issuer, uint256 nonce) view returns (bytes32)",
        "function isStoredCommitment(address issuer, uint256 nonce, bytes32 commitment) view returns (bool)",
      ],
      provider,
    );
    const storedCommitment = (await registry.getCommitment(receipt.issuer, BigInt(receipt.nonce))) as string;
    const storedCheck = (await registry.isStoredCommitment(
      receipt.issuer,
      BigInt(receipt.nonce),
      storedCommitment,
    )) as boolean;
    const comparison = compareStoredCommitment(receipt.commitment, storedCommitment);
    if (!storedCheck && comparison.status !== "not_found") {
      throw new Error("Reference provider returned an inconsistent stored commitment");
    }
    recordedComparison = comparison;
  } catch (error) {
    recordedComparison = {
      status: "provider_error",
      error: error instanceof Error ? error.message : "Reference provider failed",
    };
  }

  let historicalOracle: DirectHistoricalOracle;
  try {
    const oracle = new Contract(
      options.expectedOracle,
      [
        "function getRoundData(uint80 roundId) view returns (uint80, int256, uint256, uint256, uint80)",
        "function decimals() view returns (uint8)",
      ],
      provider,
    );
    const roundData = await oracle.getRoundData(BigInt(receipt.roundId));
    const decimals = await oracle.decimals();
    historicalOracle = compareHistoricalOracle(receipt, {
      roundId: BigInt(roundData[0]).toString(),
      price: BigInt(roundData[1]).toString(),
      observedAt: BigInt(roundData[3]).toString(),
      decimals: BigInt(decimals).toString(),
    });
  } catch (error) {
    historicalOracle = {
      status: "unavailable",
      requestedRoundId: receipt.roundId,
      error: error instanceof Error ? error.message : "Historical oracle observation unavailable",
    };
  }

  return { historicalOracle, recordedComparison };
}

export function main(args: readonly string[] = process.argv.slice(2)): void {
  const inputPath = getArgument(args, "--input");
  if (!inputPath) {
    throw new Error(
      "usage: npm run verify:quote -- --input <receipt.json> [--compare-stored] [--expected-commitment <bytes32> --expected-issuer <address> --expected-nonce <decimal>]",
    );
  }

  const raw = fs.readFileSync(inputPath, "utf8");
  const receipt = parseReceiptJson(raw);
  const options = resolveVerificationOptions(args);
  const result = verifyReceiptObject(receipt, options);
  const expectedQuote = compareExpectedQuote(
    receipt,
    hasAnyExpectedQuoteArgument(args)
      ? {
          commitment: getArgument(args, "--expected-commitment"),
          issuer: getArgument(args, "--expected-issuer"),
          nonce: getArgument(args, "--expected-nonce"),
        }
      : undefined,
  );
  const comparison = hasFlag(args, "--compare-stored")
    ? result.valid
      ? runReadOnlyComparison(
          receipt,
          options,
          getArgument(args, "--rpc-url") ?? process.env.HEDERA_RPC_URL ?? HEDERA_TESTNET_RPC_URL,
        )
      : Promise.resolve({
          historicalOracle: directNotChecked(receipt.roundId),
          recordedComparison: { status: "not_run" as const, error: "local receipt verification failed" },
        })
    : Promise.resolve({
        historicalOracle: directNotChecked(receipt.roundId),
        recordedComparison: { status: "not_run" as const },
      });

  void comparison.then(({ historicalOracle, recordedComparison }) => {
    const output: ReadOnlyVerificationOutput = {
      ...result,
      localConsistency: { status: result.valid ? "valid" : "invalid", errors: result.errors },
      expectedQuote,
      historicalOracle,
      recordedComparison,
    };
    console.log(JSON.stringify(output, null, 2));
    if (
      !result.valid ||
      expectedQuote.status === "mismatch" ||
      expectedQuote.status === "not_checked" ||
      recordedComparison.status === "wrong_network" ||
      recordedComparison.status === "provider_error"
    ) {
      process.exitCode = 2;
    }
  });
}

try {
  if (require.main === module) main();
} catch (error) {
  console.log(JSON.stringify(invalidResult(error), null, 2));
  process.exitCode = 2;
}
