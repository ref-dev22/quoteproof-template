export type CheckTone = "success" | "error" | "neutral";

export type PreviewDisplayState = "invalid_amount" | "loading" | "unavailable" | "stale" | "ready";

export function previewDisplayState({
  hasValidAmount,
  hasFetched,
  hasPreview,
  hasError,
  isFresh,
}: {
  hasValidAmount: boolean;
  hasFetched: boolean;
  hasPreview: boolean;
  hasError: boolean;
  isFresh: boolean;
}): PreviewDisplayState {
  if (!hasValidAmount) return "invalid_amount";
  if (!hasFetched) return "loading";
  if (hasError || !hasPreview) return "unavailable";
  return isFresh ? "ready" : "stale";
}

export function showShareCheckPlaceholders({
  isShared,
  isComparing,
  hasResults,
  hasError,
  isReverted,
}: {
  isShared: boolean;
  isComparing: boolean;
  hasResults: boolean;
  hasError: boolean;
  isReverted: boolean;
}): boolean {
  return isShared && !hasError && !isReverted && (isComparing || !hasResults);
}

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
