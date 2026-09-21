export type QuoteWriteGuardState = {
  hasPreview: boolean;
  hasCents: boolean;
  isConnected: boolean;
  hasNonce: boolean;
  wrongNetwork: boolean;
  isMining: boolean;
  hasTxHash: boolean;
};

/** Shared guard used by the UI so mocked wallet tests exercise the same write gate. */
export function canWriteQuote(state: QuoteWriteGuardState): boolean {
  return Boolean(
    state.hasPreview &&
    state.hasCents &&
    state.isConnected &&
    state.hasNonce &&
    !state.wrongNetwork &&
    !state.isMining &&
    !state.hasTxHash,
  );
}

export function friendlyWriteError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/user rejected|rejected the request|denied|user denied/i.test(message)) {
    return "Signature rejected. Nothing was recorded; review the quote and try again when you are ready.";
  }
  if (/PreviewRoundChanged|PreviewNonceChanged/i.test(message)) {
    return "The reference changed before recording. Refresh the preview and submit once; no automatic second write was attempted.";
  }
  if (/StaleObservation|InvalidAnswer|OracleReadFailed|FutureObservation|InvalidObservationTime/i.test(message)) {
    return "The reference feed is unavailable or outside its freshness policy. Refresh the preview and wait for a valid observation.";
  }
  if (/wrong network|chain/i.test(message)) {
    return "Your wallet is on the wrong network. Switch to Hedera Testnet before recording.";
  }
  return "The write did not complete. Check the wallet and testnet connection, then retry only after reviewing the preview.";
}
