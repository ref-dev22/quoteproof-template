import { parseReceiptJson, verifyReceiptObject } from "../../../../../../hardhat/utils/quoteReceipt";
import {
  QUOTE_PROOF_ORACLE_ADDRESS,
  QUOTE_PROOF_TESTNET_CHAIN_ID,
  getQuoteProofRegistryAddress,
} from "../../../../../contracts/quoteProofContext";
import { BoundedBodyError, readBoundedBody } from "../../../../../utils/boundedBody";
import {
  HCS_MIRROR_BASE,
  HCS_TIMEOUT_MS,
  type HcsMirrorMessage,
  compareHcsMirrorMessage,
  isHederaId,
  isTransactionHash,
  makeHcsAnchor,
  readBoundedJson,
} from "../../../../../utils/quoteHcs";

export const dynamic = "force-dynamic";
const MAX_BODY_BYTES = 64 * 1024;

function result(status: string, reason?: string, httpStatus = 200): Response {
  return Response.json({ hcsAnchor: { status, ...(reason ? { reason } : {}) } }, { status: httpStatus });
}

async function mirror(path: string): Promise<{ response: Response; data?: unknown }> {
  const response = await fetch(`${HCS_MIRROR_BASE}${path}`, { signal: AbortSignal.timeout(HCS_TIMEOUT_MS) });
  if (!response.ok) return { response };
  return { response, data: await readBoundedJson(response) };
}

export async function POST(request: Request): Promise<Response> {
  const topicId = process.env.HCS_TOPIC_ID;
  const operatorId = process.env.HCS_OPERATOR_ID;
  if (!isHederaId(topicId) || !isHederaId(operatorId)) return result("not_configured");

  let receipt;
  let transactionHash: string;
  let logIndex: number;
  let sequenceNumber: number;
  try {
    const raw = await readBoundedBody(request, MAX_BODY_BYTES);
    const body = JSON.parse(raw) as Record<string, unknown>;
    if (
      !isTransactionHash(body.transactionHash) ||
      !Number.isSafeInteger(body.logIndex) ||
      Number(body.logIndex) < 0 ||
      !Number.isSafeInteger(body.sequenceNumber) ||
      Number(body.sequenceNumber) <= 0
    ) {
      return result("invalid", "Invalid anchor reference", 400);
    }
    transactionHash = body.transactionHash;
    logIndex = Number(body.logIndex);
    sequenceNumber = Number(body.sequenceNumber);
    receipt = parseReceiptJson(JSON.stringify(body.receipt));
  } catch (error) {
    if (error instanceof BoundedBodyError) return result("invalid", error.message, error.status);
    return result("invalid", "Invalid receipt request", 400);
  }
  const local = verifyReceiptObject(receipt, {
    expectedChainId: QUOTE_PROOF_TESTNET_CHAIN_ID,
    expectedRegistry: getQuoteProofRegistryAddress(),
    expectedOracle: QUOTE_PROOF_ORACLE_ADDRESS,
  });
  if (!local.valid) return result("invalid", "Receipt failed local verification", 400);
  const expected = makeHcsAnchor(receipt, transactionHash, logIndex);

  try {
    const message = await mirror(`/topics/${topicId}/messages/${sequenceNumber}`);
    if (!message.response.ok) return result("unavailable", "HCS message not indexed or unavailable");
    const compared = compareHcsMirrorMessage(
      message.data as HcsMirrorMessage,
      expected,
      topicId,
      sequenceNumber,
      operatorId,
    );
    return result(compared.status, compared.reason);
  } catch {
    return result("unavailable", "Mirror Node read failed");
  }
}
