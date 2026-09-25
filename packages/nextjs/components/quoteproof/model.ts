"use client";

import referenceReceipt from "../../../../examples/receipt-testnet.json";
import { type Hex, formatUnits } from "viem";
import { hederaTestnet } from "viem/chains";
import { getQuoteProofRegistryAddress } from "~~/contracts/quoteProofContext";

export const TESTNET_CHAIN_ID = hederaTestnet.id;
export const MAX_CENTS = 100_000_000n;
export const REGISTRY_ADDRESS = getQuoteProofRegistryAddress();
export const HISTORICAL_TX = "0x076690438e81f96fc77f3f6467157d2f53c05703ef098790a42b82909a340ef9";
export const HAS_REFERENCE_REGISTRY = REGISTRY_ADDRESS.toLowerCase() === referenceReceipt.registry.toLowerCase();

export const quoteRecordedAbi = [
  {
    type: "event",
    name: "QuoteRecorded",
    anonymous: false,
    inputs: [
      { indexed: true, name: "commitment", type: "bytes32" },
      {
        indexed: false,
        name: "quote",
        type: "tuple",
        components: [
          { name: "schemaVersion", type: "uint256" },
          { name: "chainId", type: "uint256" },
          { name: "registry", type: "address" },
          { name: "issuer", type: "address" },
          { name: "nonce", type: "uint256" },
          { name: "cents", type: "uint256" },
          { name: "oracle", type: "address" },
          { name: "feedId", type: "bytes32" },
          { name: "roundId", type: "uint80" },
          { name: "price", type: "uint256" },
          { name: "decimals", type: "uint8" },
          { name: "observedAt", type: "uint256" },
          { name: "recordedAt", type: "uint256" },
          { name: "maximumAge", type: "uint256" },
          { name: "tinybars", type: "uint256" },
        ],
      },
    ],
  },
] as const;

export type PreviewQuote = readonly [bigint, bigint, bigint, bigint, bigint, bigint];

export type QuoteFields = {
  schemaVersion: bigint;
  chainId: bigint;
  registry: Hex;
  issuer: Hex;
  nonce: bigint;
  cents: bigint;
  oracle: Hex;
  feedId: Hex;
  roundId: bigint;
  price: bigint;
  decimals: bigint;
  observedAt: bigint;
  recordedAt: bigint;
  maximumAge: bigint;
  tinybars: bigint;
};

export type ReceiptProof = {
  commitment: Hex;
  quote: QuoteFields;
  blockNumber: bigint;
  logIndex: number;
};

export type StoredComparisonResponse = {
  localConsistency: {
    status: "valid" | "invalid" | "wrong_context";
    errors: string[];
  };
  recordedComparison: {
    status: "match" | "mismatch" | "not_found" | "wrong_context" | "wrong_network" | "provider_error" | "not_run";
    storedCommitment?: string;
    error?: string;
    providerChainId?: string;
  };
  historicalOracle: {
    status: "match" | "mismatch" | "unavailable" | "not_checked";
    requestedRoundId: string;
    returnedRoundId?: string;
    returnedPrice?: string;
    returnedObservedAt?: string;
    currentDecimals?: string;
    error?: string;
  };
};

export function normalizePreviewQuote(data: unknown): PreviewQuote | undefined {
  if (Array.isArray(data) && data.length >= 6) {
    const values = data.slice(0, 6);
    if (values.every(value => typeof value === "bigint")) return values as unknown as PreviewQuote;
  }
  if (!data || typeof data !== "object") return undefined;
  const named = data as Record<string, unknown>;
  const values = [named.nonce, named.roundId, named.price, named.decimals, named.observedAt, named.tinybars];
  if (values.every(value => typeof value === "bigint")) return values as unknown as PreviewQuote;
  const indexed = [named[0], named[1], named[2], named[3], named[4], named[5]];
  if (indexed.every(value => typeof value === "bigint")) return indexed as unknown as PreviewQuote;
  return named.result ? normalizePreviewQuote(named.result) : undefined;
}

export function parseUsdToCents(value: string): bigint | undefined {
  const match = value.trim().match(/^(\d+)(?:\.(\d{0,2}))?$/);
  if (!match) return undefined;
  const cents = BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
  return cents >= 1n && cents <= MAX_CENTS ? cents : undefined;
}

export function formatHbar(tinybars: bigint): string {
  return `${Number(formatUnits(tinybars, 8)).toLocaleString(undefined, { maximumFractionDigits: 8 })} HBAR`;
}

export function formatPrice(price: bigint, decimals: bigint): string {
  return `$${Number(formatUnits(price, Number(decimals))).toFixed(6)}`;
}

export function shortHash(value: string): string {
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}

export function comparisonStatusLabel(
  status: StoredComparisonResponse["recordedComparison"]["status"] | "valid" | "invalid",
) {
  return {
    valid: "Locally consistent",
    invalid: "Local checks failed",
    match: "Stored commitment matches",
    mismatch: "Stored commitment differs",
    not_found: "No stored commitment",
    wrong_context: "Trusted context rejected",
    wrong_network: "Provider network rejected",
    provider_error: "Provider unavailable",
    not_run: "Not run",
  }[status];
}

export function historicalOracleStatusLabel(status: StoredComparisonResponse["historicalOracle"]["status"]) {
  return {
    match: "Historical observation matches",
    mismatch: "Historical observation differs",
    unavailable: "Historical observation unavailable",
    not_checked: "Not checked",
  }[status];
}

export function serializeReceipt(proof: ReceiptProof): Record<string, string> {
  return {
    schemaVersion: proof.quote.schemaVersion.toString(),
    chainId: proof.quote.chainId.toString(),
    registry: proof.quote.registry,
    issuer: proof.quote.issuer,
    nonce: proof.quote.nonce.toString(),
    cents: proof.quote.cents.toString(),
    oracle: proof.quote.oracle,
    feedId: proof.quote.feedId,
    roundId: proof.quote.roundId.toString(),
    price: proof.quote.price.toString(),
    decimals: proof.quote.decimals.toString(),
    observedAt: proof.quote.observedAt.toString(),
    recordedAt: proof.quote.recordedAt.toString(),
    maximumAge: proof.quote.maximumAge.toString(),
    tinybars: proof.quote.tinybars.toString(),
    commitment: proof.commitment,
  };
}
