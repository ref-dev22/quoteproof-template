import { expect } from "chai";
import { FEED_ID, computeReceiptCommitment, type QuoteReceiptJson } from "../utils/quoteReceipt";
import { POST } from "../../nextjs/app/api/quote/compare/route";

const REGISTRY = "0xa1a741aF6e0A45164e2Af6A1C35dC30275629709";
const ORACLE = "0x59bC155EB6c6C415fE43255aF66EcF0523c92B4a";
const ISSUER = "0x3E5aB4bAEdF52EbD989c2A5Df973dc8281b4bE4F";

function makeReceipt(): QuoteReceiptJson {
  const receipt: QuoteReceiptJson = {
    schemaVersion: "1",
    chainId: "296",
    registry: REGISTRY,
    issuer: ISSUER,
    nonce: "0",
    cents: "100",
    oracle: ORACLE,
    feedId: FEED_ID,
    roundId: "1",
    price: "10000000",
    decimals: "8",
    observedAt: "1000",
    recordedAt: "1001",
    maximumAge: "93600",
    tinybars: "1000000000",
    commitment: `0x${"0".repeat(64)}`,
  };
  receipt.commitment = computeReceiptCommitment(receipt);
  return receipt;
}

function requestWithBody(body: string, headers: HeadersInit = { "content-type": "application/json" }): Request {
  return new Request("http://localhost/api/quote/compare", {
    method: "POST",
    headers,
    body,
  });
}

describe("quote comparison route guards", function () {
  const originalFetch = globalThis.fetch;

  afterEach(function () {
    globalThis.fetch = originalFetch;
  });

  it("rejects a wrong RPC network before calling registry getters", async function () {
    const methods: string[] = [];
    globalThis.fetch = (async (_input, init) => {
      const payload = JSON.parse(String(init?.body)) as { method: string };
      methods.push(payload.method);
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 0, result: "0x127" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const response = await POST(requestWithBody(JSON.stringify({ receipt: makeReceipt() })));
    const payload = (await response.json()) as {
      localConsistency: { status: string };
      recordedComparison: { status: string; providerChainId?: string };
    };

    expect(response.status).to.equal(200);
    expect(payload.localConsistency.status).to.equal("valid");
    expect(payload.recordedComparison).to.deep.include({ status: "wrong_network", providerChainId: "0x127" });
    expect(methods).to.deep.equal(["eth_chainId"]);
  });

  it("returns 413 for a chunked oversized wrapper before JSON parsing", async function () {
    const methods: string[] = [];
    globalThis.fetch = (async (_input, init) => {
      const payload = JSON.parse(String(init?.body)) as { method: string };
      methods.push(payload.method);
      throw new Error("RPC must not be reached");
    }) as typeof fetch;

    const paddedBody = JSON.stringify({ receipt: makeReceipt(), padding: "x".repeat(70_000) });
    const bytes = new TextEncoder().encode(paddedBody);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 20_000));
        controller.enqueue(bytes.slice(20_000, 50_000));
        controller.enqueue(bytes.slice(50_000));
        controller.close();
      },
    });
    const request = new Request("http://localhost/api/quote/compare", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: stream,
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    const response = await POST(request);
    expect(response.status).to.equal(413);
    expect(await response.json()).to.deep.equal({ error: "request body exceeds 65536 bytes" });
    expect(methods).to.deep.equal([]);
  });
});
