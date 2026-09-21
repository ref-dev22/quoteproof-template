import type { QuoteReceiptJson } from "./quoteReceipt";

export type StoredCommitmentComparison =
  | { status: "match"; storedCommitment: string }
  | { status: "mismatch"; storedCommitment: string }
  | { status: "not_found"; storedCommitment: string };

const ZERO_COMMITMENT = `0x${"0".repeat(64)}`;
const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const DECIMAL_RE = /^(0|[1-9][0-9]*)$/;

export type ExpectedQuoteInput = {
  commitment?: string;
  issuer?: string;
  nonce?: string;
};

export type ExpectedQuoteComparison =
  | { status: "not_supplied"; message: string }
  | { status: "not_checked"; errors: string[] }
  | { status: "match"; expectedCommitment: string; expectedIssuer: string; expectedNonce: string }
  | {
      status: "mismatch";
      expectedCommitment: string;
      expectedIssuer: string;
      expectedNonce: string;
      errors: string[];
    };

export type HistoricalOracleObservation = {
  roundId: string;
  price: string;
  observedAt: string;
  decimals: string;
};

export type HistoricalOracleComparison = {
  status: "match" | "mismatch";
  requestedRoundId: string;
  returnedRoundId: string;
  returnedPrice: string;
  returnedObservedAt: string;
  currentDecimals: string;
  error?: string;
};

/** Compare a receipt commitment with a validated bytes32 value read from the registry. */
export function compareStoredCommitment(
  receiptCommitment: string,
  storedCommitment: string,
): StoredCommitmentComparison {
  const normalizedStored = storedCommitment.toLowerCase();
  if (normalizedStored === ZERO_COMMITMENT) {
    return { status: "not_found", storedCommitment: normalizedStored };
  }
  return normalizedStored === receiptCommitment.toLowerCase()
    ? { status: "match", storedCommitment: normalizedStored }
    : { status: "mismatch", storedCommitment: normalizedStored };
}

/** Compare a receipt with an independently supplied expected quote reference. */
export function compareExpectedQuote(
  receipt: QuoteReceiptJson,
  expected: ExpectedQuoteInput | undefined,
): ExpectedQuoteComparison {
  if (!expected || Object.values(expected).every(value => value === undefined)) {
    return { status: "not_supplied", message: "No independent expected quote reference was supplied" };
  }

  const errors: string[] = [];
  if (!expected.commitment) errors.push("expected commitment is required");
  else if (!BYTES32_RE.test(expected.commitment)) errors.push("expected commitment must be a 32-byte hex string");
  if (!expected.issuer) errors.push("expected issuer is required");
  else if (!ADDRESS_RE.test(expected.issuer)) errors.push("expected issuer must be a valid address");
  if (!expected.nonce) errors.push("expected nonce is required");
  else if (!DECIMAL_RE.test(expected.nonce))
    errors.push("expected nonce must be a non-negative decimal integer string");
  if (errors.length > 0) return { status: "not_checked", errors };

  const expectedCommitment = expected.commitment!.toLowerCase();
  const expectedIssuer = expected.issuer!.toLowerCase();
  const expectedNonce = expected.nonce!;
  if (receipt.commitment.toLowerCase() !== expectedCommitment) {
    errors.push("receipt commitment does not match the independent expected commitment");
  }
  if (receipt.issuer.toLowerCase() !== expectedIssuer) errors.push("receipt issuer does not match the expected issuer");
  if (receipt.nonce !== expectedNonce) errors.push("receipt nonce does not match the expected nonce");
  if (errors.length > 0) {
    return { status: "mismatch", expectedCommitment, expectedIssuer, expectedNonce, errors };
  }
  return { status: "match", expectedCommitment, expectedIssuer, expectedNonce };
}

/** Compare exact historical oracle fields without comparing against the latest round. */
export function compareHistoricalOracle(
  receipt: QuoteReceiptJson,
  observation: HistoricalOracleObservation,
): HistoricalOracleComparison {
  const errors: string[] = [];
  if (observation.roundId !== receipt.roundId) errors.push("historical roundId differs from the receipt");
  if (observation.price !== receipt.price) errors.push("historical answer differs from the receipt");
  if (observation.observedAt !== receipt.observedAt) errors.push("historical updatedAt differs from the receipt");
  if (observation.decimals !== receipt.decimals)
    errors.push("current oracle decimals differ from the receipt metadata");
  return {
    status: errors.length === 0 ? "match" : "mismatch",
    requestedRoundId: receipt.roundId,
    returnedRoundId: observation.roundId,
    returnedPrice: observation.price,
    returnedObservedAt: observation.observedAt,
    currentDecimals: observation.decimals,
    ...(errors.length > 0 ? { error: errors.join("; ") } : {}),
  };
}
