import {
  type QuoteReceiptJson,
  parseReceiptJson,
  verifyReceiptObject,
} from "../../../../../hardhat/utils/quoteReceipt";
import { compareStoredCommitment } from "../../../../../hardhat/utils/quoteReceiptComparison";
import { type Hex, decodeFunctionResult, encodeFunctionData } from "viem";

const RPC_URL = process.env.NEXT_PUBLIC_HEDERA_TESTNET_RPC_URL || "https://testnet.hashio.io/api";
const EXPECTED_CHAIN_ID = 296n;
const EXPECTED_REGISTRY = "0xa1a741aF6e0A45164e2Af6A1C35dC30275629709" as const;
const EXPECTED_ORACLE = "0x59bC155EB6c6C415fE43255aF66EcF0523c92B4a" as const;
const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/;
const MAX_REQUEST_BYTES = 64 * 1024;

const getCommitmentAbi = [
  {
    type: "function",
    name: "getCommitment",
    stateMutability: "view",
    inputs: [
      { name: "issuer", type: "address" },
      { name: "nonce", type: "uint256" },
    ],
    outputs: [{ name: "commitment", type: "bytes32" }],
  },
] as const;

const isStoredCommitmentAbi = [
  {
    type: "function",
    name: "isStoredCommitment",
    stateMutability: "view",
    inputs: [
      { name: "issuer", type: "address" },
      { name: "nonce", type: "uint256" },
      { name: "commitment", type: "bytes32" },
    ],
    outputs: [{ name: "stored", type: "bool" }],
  },
] as const;

type ComparisonResponse = {
  localConsistency: {
    status: "valid" | "invalid" | "wrong_context";
    errors: string[];
  };
  recordedComparison: {
    status: "match" | "mismatch" | "not_found" | "wrong_context" | "wrong_network" | "provider_error" | "not_run";
    storedCommitment?: string;
    error?: string;
    providerChainId?: string;
  };
  context: { chainId: string; registry: string; oracle: string };
};

class RequestTooLargeError extends Error {}

async function readRequestBody(request: Request): Promise<string> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const declaredLength = Number(contentLength);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
      throw new RequestTooLargeError(`request body exceeds ${MAX_REQUEST_BYTES} bytes`);
    }
  }

  if (!request.body) {
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > MAX_REQUEST_BYTES) {
      throw new RequestTooLargeError(`request body exceeds ${MAX_REQUEST_BYTES} bytes`);
    }
    return body;
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_REQUEST_BYTES) {
        await reader.cancel();
        throw new RequestTooLargeError(`request body exceeds ${MAX_REQUEST_BYTES} bytes`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

function contextMismatch(errors: string[]): boolean {
  return errors.some(error =>
    /unexpected chainId|registry does not match the configured deployment|oracle does not match the configured provider/i.test(
      error,
    ),
  );
}

function invalidResponse(error: string): ComparisonResponse {
  return {
    localConsistency: { status: "invalid", errors: [error] },
    recordedComparison: { status: "not_run" },
    context: { chainId: EXPECTED_CHAIN_ID.toString(), registry: EXPECTED_REGISTRY, oracle: EXPECTED_ORACLE },
  };
}

async function rpcRequest<T>(method: string, params: unknown[], id: number): Promise<T> {
  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params,
    }),
    cache: "no-store",
  });
  const payload = (await response.json()) as { result?: T; error?: { message?: string } };
  if (!response.ok || payload.error || payload.result === undefined) {
    throw new Error(payload.error?.message || "Reference provider failed");
  }
  return payload.result;
}

async function rpcCall(data: Hex, id: number): Promise<Hex> {
  const result = await rpcRequest<unknown>("eth_call", [{ to: EXPECTED_REGISTRY, data }, "latest"], id);
  if (typeof result !== "string" || !/^0x[0-9a-fA-F]*$/.test(result)) {
    throw new Error("Reference provider returned an invalid call result");
  }
  return result as Hex;
}

async function rpcChainId(): Promise<{ value: bigint; hex: string }> {
  const result = await rpcRequest<unknown>("eth_chainId", [], 0);
  if (typeof result !== "string" || !/^0x[0-9a-fA-F]+$/.test(result)) {
    throw new Error("Reference provider returned an invalid chainId");
  }
  return { value: BigInt(result), hex: result };
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  let receipt: QuoteReceiptJson;
  try {
    const body = JSON.parse(await readRequestBody(request)) as { receipt?: unknown };
    if (body.receipt === undefined) throw new Error("receipt is required");
    receipt = parseReceiptJson(JSON.stringify(body.receipt));
  } catch (error) {
    if (error instanceof RequestTooLargeError) {
      return Response.json({ error: error.message }, { status: 413 });
    }
    return Response.json(invalidResponse(error instanceof Error ? error.message : "Receipt must be valid JSON"), {
      status: 400,
    });
  }

  const local = verifyReceiptObject(receipt, {
    expectedChainId: EXPECTED_CHAIN_ID,
    expectedRegistry: EXPECTED_REGISTRY,
    expectedOracle: EXPECTED_ORACLE,
  });
  const localStatus = contextMismatch(local.errors) ? "wrong_context" : local.valid ? "valid" : "invalid";
  const responseBase: ComparisonResponse = {
    localConsistency: { status: localStatus, errors: local.errors },
    recordedComparison: { status: localStatus === "wrong_context" ? "wrong_context" : "not_run" },
    context: { chainId: EXPECTED_CHAIN_ID.toString(), registry: EXPECTED_REGISTRY, oracle: EXPECTED_ORACLE },
  };

  if (localStatus !== "valid") return Response.json(responseBase);

  try {
    const providerChain = await rpcChainId();
    if (providerChain.value !== EXPECTED_CHAIN_ID) {
      return Response.json({
        ...responseBase,
        recordedComparison: {
          status: "wrong_network",
          providerChainId: providerChain.hex,
          error: `Reference provider reported chainId ${providerChain.value}; expected ${EXPECTED_CHAIN_ID}`,
        },
      });
    }

    const issuer = receipt.issuer as `0x${string}`;
    const nonce = BigInt(receipt.nonce);
    const storedRaw = await rpcCall(
      encodeFunctionData({ abi: getCommitmentAbi, functionName: "getCommitment", args: [issuer, nonce] }),
      1,
    );
    const storedCommitment = decodeFunctionResult({
      abi: getCommitmentAbi,
      functionName: "getCommitment",
      data: storedRaw,
    }) as Hex;
    if (!BYTES32_RE.test(storedCommitment)) throw new Error("Reference provider returned an invalid commitment");

    const storedCheckRaw = await rpcCall(
      encodeFunctionData({
        abi: isStoredCommitmentAbi,
        functionName: "isStoredCommitment",
        args: [issuer, nonce, storedCommitment],
      }),
      2,
    );
    const storedCheck = decodeFunctionResult({
      abi: isStoredCommitmentAbi,
      functionName: "isStoredCommitment",
      data: storedCheckRaw,
    }) as boolean;
    const storedComparison = compareStoredCommitment(receipt.commitment, storedCommitment);
    if (!storedCheck && storedComparison.status !== "not_found") {
      throw new Error("Reference provider returned an inconsistent stored commitment");
    }

    return Response.json({
      ...responseBase,
      recordedComparison: storedComparison,
    });
  } catch (error) {
    return Response.json({
      ...responseBase,
      recordedComparison: {
        status: "provider_error",
        error: error instanceof Error ? error.message : "Reference provider failed",
      },
    });
  }
}
