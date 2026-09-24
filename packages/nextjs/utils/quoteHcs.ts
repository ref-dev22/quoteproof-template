import type { QuoteReceiptJson } from "../../hardhat/utils/quoteReceipt";
import { type Hex, decodeEventLog } from "viem";

export const HCS_ANCHOR_VERSION = "quoteproof-hcs-v1";
export const HCS_MIRROR_BASE = "https://testnet.mirrornode.hedera.com/api/v1";
export const HCS_MAX_RESPONSE_BYTES = 64 * 1024;
export const HCS_TIMEOUT_MS = 5_000;

const HASH_RE = /^0x[0-9a-fA-F]{64}$/;
const ID_RE = /^0\.0\.[1-9][0-9]*$/;
const ANCHOR_FIELDS = [
  "version",
  "chainId",
  "registry",
  "transactionHash",
  "logIndex",
  "commitment",
  "issuer",
  "nonce",
] as const;

export type HcsAnchor = {
  version: typeof HCS_ANCHOR_VERSION;
  chainId: string;
  registry: string;
  transactionHash: string;
  logIndex: number;
  commitment: string;
  issuer: string;
  nonce: string;
};

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

export function isHederaId(value: unknown): value is string {
  return typeof value === "string" && ID_RE.test(value);
}

export function isTransactionHash(value: unknown): value is string {
  return typeof value === "string" && HASH_RE.test(value);
}

export function makeHcsAnchor(receipt: QuoteReceiptJson, transactionHash: string, logIndex: number): HcsAnchor {
  if (!isTransactionHash(transactionHash) || !Number.isSafeInteger(logIndex) || logIndex < 0) {
    throw new Error("Invalid transaction hash or log index");
  }
  return {
    version: HCS_ANCHOR_VERSION,
    chainId: receipt.chainId,
    registry: receipt.registry.toLowerCase(),
    transactionHash: transactionHash.toLowerCase(),
    logIndex,
    commitment: receipt.commitment.toLowerCase(),
    issuer: receipt.issuer.toLowerCase(),
    nonce: receipt.nonce,
  };
}

export function matchesQuoteRecordedLog(
  log: { address: string; data: Hex; topics: readonly Hex[]; logIndex: string },
  receipt: QuoteReceiptJson,
  expectedRegistry: string,
): number | undefined {
  if (log.address.toLowerCase() !== expectedRegistry.toLowerCase()) return undefined;
  if (log.topics.length === 0) return undefined;
  let decoded;
  try {
    decoded = decodeEventLog({ abi: quoteRecordedAbi, data: log.data, topics: [...log.topics] as [Hex, ...Hex[]] });
  } catch {
    return undefined;
  }
  if (decoded.eventName !== "QuoteRecorded") return undefined;
  const { commitment, quote } = decoded.args;
  if (commitment.toLowerCase() !== receipt.commitment.toLowerCase()) return undefined;
  const fields = [
    "schemaVersion",
    "chainId",
    "registry",
    "issuer",
    "nonce",
    "cents",
    "oracle",
    "feedId",
    "roundId",
    "price",
    "decimals",
    "observedAt",
    "recordedAt",
    "maximumAge",
    "tinybars",
  ] as const;
  for (const field of fields) {
    if (String(quote[field]).toLowerCase() !== receipt[field].toLowerCase()) return undefined;
  }
  const index = Number(log.logIndex);
  return Number.isSafeInteger(index) && index >= 0 ? index : undefined;
}

export type HcsMirrorMessage = {
  topic_id?: unknown;
  sequence_number?: unknown;
  payer_account_id?: unknown;
  message?: unknown;
};

export function compareHcsMirrorMessage(
  mirror: HcsMirrorMessage,
  expected: HcsAnchor,
  topicId: string,
  sequenceNumber: number,
  operatorId: string,
): { status: "match" | "mismatch"; reason?: string } {
  if (mirror.topic_id !== topicId || mirror.sequence_number !== sequenceNumber) {
    return { status: "mismatch", reason: "topic or sequence differs" };
  }
  if (mirror.payer_account_id !== operatorId) {
    return { status: "mismatch", reason: "message payer is not the configured server account" };
  }
  if (typeof mirror.message !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(mirror.message)) {
    return { status: "mismatch", reason: "message is not canonical base64" };
  }
  const bytes = Buffer.from(mirror.message, "base64");
  if (bytes.length > 1024 || bytes.toString("base64") !== mirror.message) {
    return { status: "mismatch", reason: "message encoding or size differs" };
  }
  let actual: unknown;
  try {
    actual = JSON.parse(bytes.toString("utf8"));
  } catch {
    return { status: "mismatch", reason: "message is not JSON" };
  }
  if (actual === null || typeof actual !== "object" || Array.isArray(actual)) {
    return { status: "mismatch", reason: "message is not an anchor object" };
  }
  const record = actual as Record<string, unknown>;
  if (Object.keys(record).sort().join(",") !== [...ANCHOR_FIELDS].sort().join(",")) {
    return { status: "mismatch", reason: "anchor fields differ" };
  }
  for (const field of ANCHOR_FIELDS) {
    if (record[field] !== expected[field]) return { status: "mismatch", reason: `${field} differs` };
  }
  return { status: "match" };
}

export async function readBoundedJson(response: Response): Promise<unknown> {
  const length = response.headers.get("content-length");
  if (length !== null && Number(length) > HCS_MAX_RESPONSE_BYTES) throw new Error("Remote response too large");
  const body = await response.text();
  if (Buffer.byteLength(body, "utf8") > HCS_MAX_RESPONSE_BYTES) throw new Error("Remote response too large");
  return JSON.parse(body) as unknown;
}
