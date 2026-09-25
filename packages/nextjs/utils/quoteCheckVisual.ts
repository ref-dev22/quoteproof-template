export type CheckTone = "success" | "error" | "neutral";

export function checkTone(status: string): CheckTone {
  if (status === "valid" || status === "match") return "success";
  if (
    status === "invalid" ||
    status === "mismatch" ||
    status === "not_found" ||
    status === "wrong_context" ||
    status === "wrong_network"
  ) {
    return "error";
  }
  return "neutral";
}

export function shareAutoComparisonKey(
  activeHash: string | undefined,
  shareHash: string | undefined,
  commitment: string | undefined,
): string | undefined {
  if (!activeHash || !shareHash || !commitment || activeHash.toLowerCase() !== shareHash.toLowerCase())
    return undefined;
  return `${activeHash.toLowerCase()}:${commitment.toLowerCase()}`;
}
