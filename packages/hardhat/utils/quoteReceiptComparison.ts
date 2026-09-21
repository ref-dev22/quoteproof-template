export type StoredCommitmentComparison =
  | { status: "match"; storedCommitment: string }
  | { status: "mismatch"; storedCommitment: string }
  | { status: "not_found"; storedCommitment: string };

const ZERO_COMMITMENT = `0x${"0".repeat(64)}`;

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
