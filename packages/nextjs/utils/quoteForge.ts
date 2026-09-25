import genuineReceipt from "../../../examples/adversarial/genuine.json";
import amountForgery from "../../../examples/adversarial/recomputed-cents-1000.json";
import priceForgery from "../../../examples/adversarial/recomputed-double-price.json";
import tinybarForgery from "../../../examples/adversarial/simple-tamper-tinybars-plus-one.json";

export const FORGE_CASES = [
  { id: "tinybar", label: "Add 1 tinybar", receipt: tinybarForgery },
  { id: "amount", label: "Change $1.00 to $10.00 and recompute the fingerprint", receipt: amountForgery },
  { id: "price", label: "Double the oracle price and recompute the fingerprint", receipt: priceForgery },
] as const;

export type ForgeCaseId = (typeof FORGE_CASES)[number]["id"];
export type ForgeRunState = {
  caseId: ForgeCaseId | null;
  phase: "idle" | "running" | "ready" | "network_error";
  forgedEver: boolean;
};
export type ForgeRunAction =
  { type: "start"; caseId: ForgeCaseId | null } | { type: "complete" } | { type: "network_error" } | { type: "reset" };

export const initialForgeRunState: ForgeRunState = { caseId: null, phase: "idle", forgedEver: false };

export function isHistoricalForgeReceipt(commitment?: string): boolean {
  return commitment?.toLowerCase() === genuineReceipt.commitment.toLowerCase();
}

export function forgeReceipt(caseId: ForgeCaseId) {
  return FORGE_CASES.find(item => item.id === caseId)!.receipt;
}

export function forgeRunReducer(state: ForgeRunState, action: ForgeRunAction): ForgeRunState {
  if (action.type === "reset") return initialForgeRunState;
  if (action.type === "start") {
    return { caseId: action.caseId, phase: "running", forgedEver: state.forgedEver || action.caseId !== null };
  }
  return { ...state, phase: action.type === "complete" ? "ready" : "network_error" };
}

export function forgeDisplayState(state: ForgeRunState): "idle" | "running" | "forged" | "restored" | "network_error" {
  if (state.phase === "running") return "running";
  if (state.phase === "network_error") return "network_error";
  if (state.caseId) return "forged";
  return state.forgedEver && state.phase === "ready" ? "restored" : "idle";
}

export type ForgeCheck = "local" | "stored" | "oracle" | "hcs";

export function forgeCheckExplanation(check: ForgeCheck, status: string): string | undefined {
  if (!["invalid", "mismatch", "not_found", "wrong_context", "wrong_network"].includes(status)) return undefined;
  if (check === "local") return "The receipt fields no longer agree with their fingerprint.";
  if (check === "stored") return "The issuer and nonce record on Hedera does not contain this fingerprint.";
  if (check === "oracle") return "The recorded oracle round has a different observation.";
  return status === "invalid"
    ? "HCS verification rejected the locally invalid receipt."
    : "The public HCS message anchors the genuine receipt, not this copy.";
}
