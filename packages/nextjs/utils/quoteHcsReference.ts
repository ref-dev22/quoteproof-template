export type HcsAnchorReference = { topicId: string; sequenceNumber: number };

export type HcsAnchorViewStatus =
  | "not_anchored"
  | "checking"
  | "not_configured"
  | "match"
  | "mismatch"
  | "unavailable"
  | "invalid";

const TOPIC_ID_RE = /^0\.0\.[1-9][0-9]*$/;
const SEQUENCE_RE = /^[1-9][0-9]*$/;

export const HISTORICAL_HCS_REFERENCE: HcsAnchorReference = {
  topicId: "0.0.10698279",
  sequenceNumber: 1,
};

export function parseHcsAnchorReference(search: string): HcsAnchorReference | undefined {
  const params = new URLSearchParams(search);
  const topicId = params.get("hcsTopic");
  const sequence = params.get("hcsSeq");
  if (!topicId || !TOPIC_ID_RE.test(topicId) || !sequence || !SEQUENCE_RE.test(sequence)) return undefined;
  const sequenceNumber = Number(sequence);
  if (!Number.isSafeInteger(sequenceNumber)) return undefined;
  return { topicId, sequenceNumber };
}

export function quoteSharePath(transactionHash: string, reference?: HcsAnchorReference): string {
  const params = new URLSearchParams({ tx: transactionHash });
  if (reference) {
    params.set("hcsTopic", reference.topicId);
    params.set("hcsSeq", String(reference.sequenceNumber));
  }
  return `/?${params.toString()}`;
}

export function hcsAnchorViewStatus(reference?: HcsAnchorReference, resultStatus?: unknown): HcsAnchorViewStatus {
  if (!reference) return "not_anchored";
  if (resultStatus === undefined) return "checking";
  if (
    resultStatus === "not_configured" ||
    resultStatus === "match" ||
    resultStatus === "mismatch" ||
    resultStatus === "unavailable" ||
    resultStatus === "invalid"
  ) {
    return resultStatus;
  }
  return "unavailable";
}

export function hcsAnchorStatusLabel(status: HcsAnchorViewStatus): string {
  return {
    not_anchored: "Not anchored",
    checking: "Checking HCS anchor…",
    not_configured: "Not configured",
    match: "HCS anchor matches",
    mismatch: "HCS anchor differs",
    unavailable: "HCS check unavailable",
    invalid: "Invalid anchor reference",
  }[status];
}
