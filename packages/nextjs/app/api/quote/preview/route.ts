import { QUOTE_PROOF_TESTNET_CHAIN_ID, getQuoteProofRegistryAddress } from "../../../../contracts/quoteProofContext";
import { type Hex, decodeFunctionResult, encodeFunctionData } from "viem";

const RPC_URL = process.env.NEXT_PUBLIC_HEDERA_TESTNET_RPC_URL || "https://testnet.hashio.io/api";
const MAX_CENTS_TEXT_LENGTH = 32;
const RPC_TIMEOUT_MS = 5_000;
const MAX_RPC_RESPONSE_BYTES = 64 * 1024;
const previewQuoteAbi = [
  {
    type: "function",
    name: "previewQuote",
    stateMutability: "view",
    inputs: [{ name: "cents", type: "uint256" }],
    outputs: [
      { name: "nonce", type: "uint256" },
      { name: "roundId", type: "uint80" },
      { name: "price", type: "uint256" },
      { name: "decimals", type: "uint8" },
      { name: "observedAt", type: "uint256" },
      { name: "tinybars", type: "uint256" },
    ],
  },
] as const;

export const dynamic = "force-dynamic";
export const revalidate = 0;

class RpcResponseTooLargeError extends Error {}

async function readRpcResponseBody(response: Response): Promise<string> {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    const declaredLength = Number(contentLength);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_RPC_RESPONSE_BYTES) {
      throw new RpcResponseTooLargeError(`RPC response exceeds ${MAX_RPC_RESPONSE_BYTES} bytes`);
    }
  }

  if (!response.body) {
    const body = await response.text();
    if (new TextEncoder().encode(body).byteLength > MAX_RPC_RESPONSE_BYTES) {
      throw new RpcResponseTooLargeError(`RPC response exceeds ${MAX_RPC_RESPONSE_BYTES} bytes`);
    }
    return body;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_RPC_RESPONSE_BYTES) {
        await reader.cancel();
        throw new RpcResponseTooLargeError(`RPC response exceeds ${MAX_RPC_RESPONSE_BYTES} bytes`);
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

async function rpcRequest<T>(method: string, params: unknown[], id: number): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
  try {
    const response = await fetch(RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = (await readRpcResponseBody(response)) as string;
    const parsed = JSON.parse(payload) as { result?: T; error?: { message?: string } };
    if (!response.ok || parsed.error || parsed.result === undefined) {
      throw new Error(parsed.error?.message || "Reference RPC failed");
    }
    return parsed.result;
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(request: Request) {
  const centsText = new URL(request.url).searchParams.get("cents");
  if (!centsText || centsText.length > MAX_CENTS_TEXT_LENGTH || !/^\d+$/.test(centsText)) {
    return Response.json({ error: "Invalid cents" }, { status: 400 });
  }

  try {
    const cents = BigInt(centsText);
    if (cents < 1n || cents > 100_000_000n) {
      return Response.json({ error: "Invalid cents" }, { status: 400 });
    }

    const chainIdResult = await rpcRequest<unknown>("eth_chainId", [], 0);
    if (typeof chainIdResult !== "string" || !/^0x[0-9a-fA-F]+$/.test(chainIdResult)) {
      throw new Error("Reference provider returned an invalid chainId");
    }
    const chainId = BigInt(chainIdResult);
    if (chainId !== QUOTE_PROOF_TESTNET_CHAIN_ID) {
      throw new Error(`Reference provider reported chainId ${chainId}; expected ${QUOTE_PROOF_TESTNET_CHAIN_ID}`);
    }

    const data = encodeFunctionData({ abi: previewQuoteAbi, functionName: "previewQuote", args: [cents] });
    const result = await rpcRequest<unknown>("eth_call", [{ to: getQuoteProofRegistryAddress(), data }, "latest"], 1);
    if (typeof result !== "string" || !/^0x[0-9a-fA-F]*$/.test(result)) {
      throw new Error("Reference provider returned an invalid call result");
    }

    const [nonce, roundId, price, decimals, observedAt, tinybars] = decodeFunctionResult({
      abi: previewQuoteAbi,
      functionName: "previewQuote",
      data: result as Hex,
    }) as readonly [bigint, bigint, bigint, number, bigint, bigint];

    return Response.json({
      nonce: nonce.toString(),
      roundId: roundId.toString(),
      price: price.toString(),
      decimals: decimals.toString(),
      observedAt: observedAt.toString(),
      tinybars: tinybars.toString(),
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Reference unavailable" }, { status: 502 });
  }
}
