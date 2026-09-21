import { type Hex, decodeFunctionResult, encodeFunctionData } from "viem";

const RPC_URL = process.env.NEXT_PUBLIC_HEDERA_TESTNET_RPC_URL || "https://testnet.hashio.io/api";
const REGISTRY_ADDRESS = "0xa1a741aF6e0A45164e2Af6A1C35dC30275629709" as Hex;
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

export async function GET(request: Request) {
  const centsText = new URL(request.url).searchParams.get("cents");
  if (!centsText || !/^\d+$/.test(centsText)) {
    return Response.json({ error: "Invalid cents" }, { status: 400 });
  }

  try {
    const data = encodeFunctionData({ abi: previewQuoteAbi, functionName: "previewQuote", args: [BigInt(centsText)] });
    const response = await fetch(RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [{ to: REGISTRY_ADDRESS, data }, "latest"],
      }),
      cache: "no-store",
    });
    const payload = (await response.json()) as { result?: Hex; error?: { message?: string } };
    if (!response.ok || payload.error || !payload.result) {
      throw new Error(payload.error?.message || "Reference RPC failed");
    }

    const [nonce, roundId, price, decimals, observedAt, tinybars] = decodeFunctionResult({
      abi: previewQuoteAbi,
      functionName: "previewQuote",
      data: payload.result,
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
