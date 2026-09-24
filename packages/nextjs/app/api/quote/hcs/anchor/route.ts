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
  isHederaId,
  isTransactionHash,
  makeHcsAnchor,
  matchesQuoteRecordedLog,
  readBoundedJson,
} from "../../../../../utils/quoteHcs";
import {
  checkHcsOperatorMirrorIdentity,
  loadHcsOperatorKey,
  matchesHcsTopicSubmitKey,
} from "../../../../../utils/quoteHcsOperator";
import { hcsSdk } from "../../../../../utils/quoteHcsSdk";
import type { Client } from "@hiero-ledger/sdk";
import { timingSafeEqual } from "node:crypto";
import type { Hex } from "viem";

export const dynamic = "force-dynamic";
const MAX_BODY_BYTES = 64 * 1024;
const RPC_URL = process.env.NEXT_PUBLIC_HEDERA_TESTNET_RPC_URL || "https://testnet.hashio.io/api";

function reply(status: number, message: string, details?: Record<string, unknown>): Response {
  return Response.json({ error: message, ...details }, { status });
}

function authorized(request: Request, token: string | undefined): boolean {
  if (!token) return false;
  const supplied = request.headers.get("authorization");
  if (!supplied?.startsWith("Bearer ")) return false;
  const actual = Buffer.from(supplied.slice(7));
  const expected = Buffer.from(token);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function rpc(method: string, params: unknown[]): Promise<unknown> {
  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(HCS_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error("RPC unavailable");
  const json = (await readBoundedJson(response)) as { result?: unknown; error?: unknown };
  if (json.error || json.result === undefined) throw new Error("RPC returned no result");
  return json.result;
}

export async function POST(request: Request): Promise<Response> {
  const operatorId = process.env.HCS_OPERATOR_ID;
  const operatorKey = process.env.HCS_OPERATOR_KEY;
  const topicId = process.env.HCS_TOPIC_ID;
  const token = process.env.HCS_ANCHOR_TOKEN;
  if (!authorized(request, token)) return reply(401, "Anchor authorization required");
  if (!isHederaId(operatorId) || !isHederaId(topicId) || !operatorKey) {
    return reply(503, "HCS anchoring is not configured");
  }
  if (process.env.HCS_ANCHOR_DISABLED === "true") return reply(503, "HCS anchoring unavailable");

  let transactionHash: string;
  let receipt;
  try {
    const raw = await readBoundedBody(request, MAX_BODY_BYTES);
    const body = JSON.parse(raw) as { transactionHash?: unknown; receipt?: unknown };
    if (!isTransactionHash(body.transactionHash)) return reply(400, "Invalid transaction hash");
    transactionHash = body.transactionHash;
    receipt = parseReceiptJson(JSON.stringify(body.receipt));
  } catch (error) {
    if (error instanceof BoundedBodyError) return reply(error.status, error.message);
    return reply(400, "Invalid receipt request");
  }

  const registry = getQuoteProofRegistryAddress();
  const local = verifyReceiptObject(receipt, {
    expectedChainId: QUOTE_PROOF_TESTNET_CHAIN_ID,
    expectedRegistry: registry,
    expectedOracle: QUOTE_PROOF_ORACLE_ADDRESS,
  });
  if (!local.valid) return reply(400, "Receipt failed local verification");

  let logIndex: number | undefined;
  try {
    if ((await rpc("eth_chainId", [])) !== "0x128") return reply(409, "RPC is not Hedera Testnet");
    const tx = (await rpc("eth_getTransactionReceipt", [transactionHash])) as {
      status?: unknown;
      transactionHash?: unknown;
      logs?: Array<{ address: string; data: Hex; topics: readonly Hex[]; logIndex: string }>;
    } | null;
    if (!tx || tx.status !== "0x1" || String(tx.transactionHash).toLowerCase() !== transactionHash.toLowerCase()) {
      return reply(409, "Transaction is not confirmed successful");
    }
    const matching = (tx.logs ?? [])
      .map(log => matchesQuoteRecordedLog(log, receipt, registry))
      .filter((index): index is number => index !== undefined);
    if (matching.length !== 1) return reply(409, "Matching QuoteRecorded event not found uniquely");
    logIndex = matching[0];
  } catch {
    return reply(502, "Could not confirm the on-chain event");
  }

  const anchor = makeHcsAnchor(receipt, transactionHash, logIndex);
  let client: Client | undefined;
  let stage = "load operator key";
  let hcsTransactionId: string | undefined;
  try {
    const key = loadHcsOperatorKey(operatorKey);
    stage = "verify operator mirror";
    if (!(await checkHcsOperatorMirrorIdentity(operatorId, key))) {
      console.error("HCS anchoring unavailable: operator public key differs from Mirror account");
      return reply(503, "HCS anchoring unavailable");
    }
    stage = "read topic mirror";
    const topicResponse = await fetch(`${HCS_MIRROR_BASE}/topics/${topicId}`, {
      signal: AbortSignal.timeout(HCS_TIMEOUT_MS),
    });
    if (!topicResponse.ok) throw new Error("Mirror topic metadata unavailable");
    const topicInfo = await readBoundedJson(topicResponse);
    if (!matchesHcsTopicSubmitKey(topicInfo, key)) {
      return reply(409, "Topic submit key is not the configured server key");
    }
    stage = "configure operator";
    client = hcsSdk.Client.forTestnet().setOperator(hcsSdk.AccountId.fromString(operatorId), key);
    const topic = hcsSdk.TopicId.fromString(topicId);
    stage = "submit message";
    const submission = new hcsSdk.TopicMessageSubmitTransaction()
      .setTopicId(topic)
      .setMessage(JSON.stringify(anchor))
      .freezeWith(client);
    await submission.sign(key);
    const submitted = await submission.execute(client);
    hcsTransactionId = submitted.transactionId.toString();
    console.info("HCS anchor transaction submitted", { hcsTransactionId });
    stage = "confirm message";
    const confirmed = await submitted.getReceipt(client);
    const sequenceNumber = Number(confirmed.topicSequenceNumber?.toString());
    if (!Number.isSafeInteger(sequenceNumber) || sequenceNumber <= 0) throw new Error("Missing HCS sequence");
    return Response.json({
      hcsAnchor: { status: "submitted", topicId, sequenceNumber, transactionHash, logIndex, hcsTransactionId },
    });
  } catch (error) {
    console.error("HCS anchor failed", {
      stage,
      hcsTransactionId,
      name: error instanceof Error ? error.name : "unknown",
      status: error && typeof error === "object" && "status" in error ? String(error.status) : undefined,
    });
    if (hcsTransactionId) {
      return Response.json(
        { hcsAnchor: { status: "pending", hcsTransactionId }, error: "HCS anchor confirmation is pending" },
        { status: 502 },
      );
    }
    return reply(502, "HCS anchor was not submitted");
  } finally {
    client?.close();
  }
}
