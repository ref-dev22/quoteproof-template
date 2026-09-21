import { AbiCoder, ZeroAddress, getAddress, isAddress, keccak256, toUtf8Bytes } from "ethers";

export const RECEIPT_MAX_BYTES = 64 * 1024;
export const SCHEMA_VERSION = 1n;
export const MIN_CENTS = 1n;
export const MAX_CENTS = 100_000_000n;
export const MAX_ORACLE_DECIMALS = 18;
export const REFERENCE_MAX_AGE = 93_600n;
export const FEED_ID = keccak256(toUtf8Bytes("HBAR/USD"));

const UINT8_MAX = 2n ** 8n - 1n;
const UINT80_MAX = 2n ** 80n - 1n;
const UINT256_MAX = 2n ** 256n - 1n;

const RECEIPT_FIELDS = [
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
  "commitment",
] as const;

const RECEIPT_TUPLE =
  "tuple(uint256,uint256,address,address,uint256,uint256,address,bytes32,uint80,uint256,uint8,uint256,uint256,uint256,uint256)";

export type QuoteReceiptJson = {
  [Field in (typeof RECEIPT_FIELDS)[number]]: string;
};

export type VerificationResult = {
  valid: boolean;
  level: "calculation-checked" | "invalid";
  errors: string[];
  computedCommitment?: string;
  expectedTinybars?: string;
  onChainVerified: false;
  checks: {
    expectedChainId: boolean;
    expectedRegistry: boolean;
    expectedOracle: boolean;
    expectedIssuer: boolean;
    feedId: boolean;
    arithmetic: boolean;
    commitment: boolean;
  };
};

export type VerificationOptions = {
  expectedChainId?: bigint;
  expectedRegistry?: string;
  expectedOracle?: string;
  expectedIssuer?: string;
};

type ParsedReceipt = {
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
  decimals: number;
  observedAt: bigint;
  recordedAt: bigint;
  maximumAge: bigint;
  tinybars: bigint;
  commitment: string;
};

function parseUint(name: string, value: unknown, errors: string[]): bigint | undefined {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) {
    errors.push(`${name} must be a non-negative decimal integer string`);
    return undefined;
  }
  try {
    return BigInt(value);
  } catch {
    errors.push(`${name} is not a valid integer`);
    return undefined;
  }
}

function parseAddress(name: string, value: unknown, errors: string[]): string | undefined {
  if (typeof value !== "string" || !isAddress(value)) {
    errors.push(`${name} must be a valid address`);
    return undefined;
  }
  const address = getAddress(value);
  if (address === ZeroAddress) {
    errors.push(`${name} must not be the zero address`);
    return undefined;
  }
  return address;
}

function parseBytes32(name: string, value: unknown, errors: string[]): string | undefined {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    errors.push(`${name} must be a 32-byte hex string`);
    return undefined;
  }
  return value.toLowerCase();
}

export function parseReceiptJson(raw: string): QuoteReceiptJson {
  if (Buffer.byteLength(raw, "utf8") > RECEIPT_MAX_BYTES) {
    throw new Error(`receipt exceeds ${RECEIPT_MAX_BYTES} bytes`);
  }

  const parsed: unknown = JSON.parse(raw);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("receipt must be a JSON object");
  }

  const keys = Object.keys(parsed);
  const unknown = keys.filter(key => !(RECEIPT_FIELDS as readonly string[]).includes(key));
  const missing = RECEIPT_FIELDS.filter(field => !Object.prototype.hasOwnProperty.call(parsed, field));
  if (unknown.length > 0) throw new Error(`unknown receipt fields: ${unknown.join(", ")}`);
  if (missing.length > 0) throw new Error(`missing receipt fields: ${missing.join(", ")}`);

  return parsed as QuoteReceiptJson;
}

function parseReceipt(receipt: QuoteReceiptJson, errors: string[]): ParsedReceipt | undefined {
  const schemaVersion = parseUint("schemaVersion", receipt.schemaVersion, errors);
  const chainId = parseUint("chainId", receipt.chainId, errors);
  const registry = parseAddress("registry", receipt.registry, errors);
  const issuer = parseAddress("issuer", receipt.issuer, errors);
  const nonce = parseUint("nonce", receipt.nonce, errors);
  const cents = parseUint("cents", receipt.cents, errors);
  const oracle = parseAddress("oracle", receipt.oracle, errors);
  const feedId = parseBytes32("feedId", receipt.feedId, errors);
  const roundId = parseUint("roundId", receipt.roundId, errors);
  const price = parseUint("price", receipt.price, errors);
  const decimalsValue = parseUint("decimals", receipt.decimals, errors);
  const observedAt = parseUint("observedAt", receipt.observedAt, errors);
  const recordedAt = parseUint("recordedAt", receipt.recordedAt, errors);
  const maximumAge = parseUint("maximumAge", receipt.maximumAge, errors);
  const tinybars = parseUint("tinybars", receipt.tinybars, errors);
  const commitment = parseBytes32("commitment", receipt.commitment, errors);

  if (
    schemaVersion === undefined ||
    chainId === undefined ||
    registry === undefined ||
    issuer === undefined ||
    nonce === undefined ||
    cents === undefined ||
    oracle === undefined ||
    feedId === undefined ||
    roundId === undefined ||
    price === undefined ||
    decimalsValue === undefined ||
    observedAt === undefined ||
    recordedAt === undefined ||
    maximumAge === undefined ||
    tinybars === undefined ||
    commitment === undefined
  ) {
    return undefined;
  }

  if (decimalsValue > BigInt(Number.MAX_SAFE_INTEGER)) {
    errors.push("decimals is too large");
    return undefined;
  }

  if (decimalsValue > UINT8_MAX) errors.push("decimals exceeds uint8 ABI range");
  if (roundId > UINT80_MAX) errors.push("roundId exceeds uint80 ABI range");

  const uint256Fields: Array<[string, bigint]> = [
    ["schemaVersion", schemaVersion],
    ["chainId", chainId],
    ["nonce", nonce],
    ["cents", cents],
    ["price", price],
    ["observedAt", observedAt],
    ["recordedAt", recordedAt],
    ["maximumAge", maximumAge],
    ["tinybars", tinybars],
  ];
  for (const [name, value] of uint256Fields) {
    if (value > UINT256_MAX) errors.push(`${name} exceeds uint256 ABI range`);
  }
  if (errors.length > 0) return undefined;

  return {
    schemaVersion,
    chainId,
    registry,
    issuer,
    nonce,
    cents,
    oracle,
    feedId,
    roundId,
    price,
    decimals: Number(decimalsValue),
    observedAt,
    recordedAt,
    maximumAge,
    tinybars,
    commitment,
  };
}

export function computeReceiptCommitment(receipt: QuoteReceiptJson): string {
  const errors: string[] = [];
  const parsed = parseReceipt(receipt, errors);
  if (!parsed || errors.length > 0) throw new Error(errors.join("; "));
  return keccak256(
    AbiCoder.defaultAbiCoder().encode(
      [RECEIPT_TUPLE],
      [
        [
          parsed.schemaVersion,
          parsed.chainId,
          parsed.registry,
          parsed.issuer,
          parsed.nonce,
          parsed.cents,
          parsed.oracle,
          parsed.feedId,
          parsed.roundId,
          parsed.price,
          parsed.decimals,
          parsed.observedAt,
          parsed.recordedAt,
          parsed.maximumAge,
          parsed.tinybars,
        ],
      ],
    ),
  );
}

export function verifyReceiptObject(
  receipt: QuoteReceiptJson,
  options: bigint | VerificationOptions = {},
): VerificationResult {
  const normalizedOptions: VerificationOptions = typeof options === "bigint" ? { expectedChainId: options } : options;
  const checks = {
    expectedChainId: normalizedOptions.expectedChainId !== undefined,
    expectedRegistry: normalizedOptions.expectedRegistry !== undefined,
    expectedOracle: normalizedOptions.expectedOracle !== undefined,
    expectedIssuer: normalizedOptions.expectedIssuer !== undefined,
    feedId: false,
    arithmetic: false,
    commitment: false,
  };
  const errors: string[] = [];
  const parsed = parseReceipt(receipt, errors);
  if (!parsed) return { valid: false, level: "invalid", errors, onChainVerified: false, checks };

  if (parsed.schemaVersion !== SCHEMA_VERSION) errors.push("unsupported schemaVersion");
  if (normalizedOptions.expectedChainId !== undefined && parsed.chainId !== normalizedOptions.expectedChainId) {
    errors.push(`unexpected chainId: expected ${normalizedOptions.expectedChainId}, got ${parsed.chainId}`);
  }
  if (normalizedOptions.expectedRegistry !== undefined) {
    try {
      if (parsed.registry !== getAddress(normalizedOptions.expectedRegistry)) {
        errors.push("registry does not match the configured deployment");
      }
    } catch {
      errors.push("configured deployment registry is not a valid address");
    }
  }
  if (normalizedOptions.expectedOracle !== undefined) {
    try {
      if (parsed.oracle !== getAddress(normalizedOptions.expectedOracle)) {
        errors.push("oracle does not match the configured provider");
      }
    } catch {
      errors.push("configured provider is not a valid address");
    }
  }
  if (normalizedOptions.expectedIssuer !== undefined) {
    try {
      if (parsed.issuer !== getAddress(normalizedOptions.expectedIssuer)) {
        errors.push("issuer does not match the configured transaction sender");
      }
    } catch {
      errors.push("configured transaction sender is not a valid address");
    }
  }
  checks.feedId = true;
  if (parsed.feedId !== FEED_ID.toLowerCase()) errors.push("feedId is not HBAR/USD");
  if (parsed.cents < MIN_CENTS || parsed.cents > MAX_CENTS) errors.push("cents is out of bounds");
  if (parsed.roundId === 0n) errors.push("roundId must be positive");
  if (parsed.price === 0n) errors.push("price must be positive");
  if (parsed.decimals > MAX_ORACLE_DECIMALS) errors.push("decimals exceeds supported maximum");
  if (parsed.maximumAge !== REFERENCE_MAX_AGE) errors.push("maximumAge does not match the frozen policy");
  if (parsed.observedAt === 0n || parsed.recordedAt === 0n) errors.push("timestamps must be positive");
  if (parsed.recordedAt < parsed.observedAt) errors.push("recordedAt precedes observedAt");
  if (parsed.recordedAt >= parsed.observedAt && parsed.recordedAt - parsed.observedAt > parsed.maximumAge) {
    errors.push("receipt age exceeded its policy at recording time");
  }

  const expectedTinybars =
    parsed.price > 0n && parsed.decimals <= MAX_ORACLE_DECIMALS
      ? (() => {
          const numerator = parsed.cents * 10n ** BigInt(parsed.decimals + 6);
          const quotient = numerator / parsed.price;
          return numerator % parsed.price === 0n ? quotient : quotient + 1n;
        })()
      : undefined;
  checks.arithmetic = expectedTinybars !== undefined;
  if (expectedTinybars !== undefined && parsed.tinybars !== expectedTinybars) {
    errors.push("tinybars does not match independent ceiling arithmetic");
  }

  let computedCommitment: string | undefined;
  try {
    computedCommitment = computeReceiptCommitment(receipt);
    checks.commitment = true;
    if (computedCommitment.toLowerCase() !== parsed.commitment.toLowerCase()) {
      errors.push("commitment does not match the receipt fields");
    }
  } catch {
    errors.push("receipt fields cannot be ABI-encoded");
  }

  return {
    valid: errors.length === 0,
    level: errors.length === 0 ? "calculation-checked" : "invalid",
    errors,
    onChainVerified: false,
    checks,
    computedCommitment,
    expectedTinybars: expectedTinybars?.toString(),
  };
}
