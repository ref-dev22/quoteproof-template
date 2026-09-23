import { expect } from "chai";
import { GET } from "../../nextjs/app/api/quote/preview/route";
import deployedContracts from "../../nextjs/contracts/deployedContracts";

function request(cents: string): Request {
  return new Request(`http://localhost/api/quote/preview?cents=${encodeURIComponent(cents)}`);
}

function word(value: bigint): string {
  return value.toString(16).padStart(64, "0");
}

function previewResult(): string {
  return `0x${[7n, 42n, 10_000_000n, 8n, 1_700_000_000n, 1_000_000_000n].map(word).join("")}`;
}

describe("quote preview route guards", function () {
  const originalFetch = globalThis.fetch;

  afterEach(function () {
    globalThis.fetch = originalFetch;
  });

  it("rejects out-of-range and overlong cents before making an RPC request", async function () {
    for (const cents of ["0", "100000001", "9".repeat(33)]) {
      const methods: string[] = [];
      globalThis.fetch = (async (_input, init) => {
        methods.push(JSON.parse(String(init?.body)).method);
        throw new Error("RPC must not be reached");
      }) as typeof fetch;

      const response = await GET(request(cents));
      expect(response.status).to.equal(400);
      expect(await response.json()).to.deep.equal({ error: "Invalid cents" });
      expect(methods).to.deep.equal([]);
    }
  });

  it("rejects a provider on the wrong chain before calling previewQuote", async function () {
    const methods: string[] = [];
    globalThis.fetch = (async (_input, init) => {
      const payload = JSON.parse(String(init?.body)) as { method: string };
      methods.push(payload.method);
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 0, result: "0x127" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const response = await GET(request("100"));
    expect(response.status).to.equal(502);
    expect(await response.json()).to.deep.equal({
      error: "Reference provider reported chainId 295; expected 296",
    });
    expect(methods).to.deep.equal(["eth_chainId"]);
  });

  it("returns all decimal-string preview fields for a valid testnet response", async function () {
    const methods: string[] = [];
    globalThis.fetch = (async (_input, init) => {
      const payload = JSON.parse(String(init?.body)) as { method: string };
      methods.push(payload.method);
      expect(init?.signal).to.be.instanceOf(AbortSignal);
      const result = payload.method === "eth_chainId" ? "0x128" : previewResult();
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: payload.method === "eth_chainId" ? 0 : 1, result }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const response = await GET(request("100"));
    expect(response.status).to.equal(200);
    expect(await response.json()).to.deep.equal({
      nonce: "7",
      roundId: "42",
      price: "10000000",
      decimals: "8",
      observedAt: "1700000000",
      tinybars: "1000000000",
    });
    expect(methods).to.deep.equal(["eth_chainId", "eth_call"]);
  });

  it("previews through the alternate address generated for Scaffold hooks", async function () {
    const deployment = deployedContracts[296].QuoteProofRegistry as unknown as { address: string };
    const originalAddress = deployment.address;
    const alternateAddress = "0x1111111111111111111111111111111111111111";
    deployment.address = alternateAddress;
    try {
      const calls: string[] = [];
      globalThis.fetch = (async (_input, init) => {
        const payload = JSON.parse(String(init?.body)) as { method: string; params?: [{ to?: string }] };
        if (payload.method === "eth_call") calls.push(payload.params?.[0]?.to ?? "");
        const result = payload.method === "eth_chainId" ? "0x128" : previewResult();
        return new Response(JSON.stringify({ jsonrpc: "2.0", id: calls.length, result }), { status: 200 });
      }) as typeof fetch;

      const response = await GET(request("100"));
      expect(response.status).to.equal(200);
      expect(calls).to.deep.equal([alternateAddress]);
    } finally {
      deployment.address = originalAddress;
    }
  });

  it("returns a provider failure without accepting an RPC error payload", async function () {
    const methods: string[] = [];
    globalThis.fetch = (async (_input, init) => {
      const payload = JSON.parse(String(init?.body)) as { method: string };
      methods.push(payload.method);
      if (payload.method === "eth_chainId") {
        return new Response(JSON.stringify({ jsonrpc: "2.0", id: 0, result: "0x128" }), { status: 200 });
      }
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { message: "node unavailable" } }), {
        status: 200,
      });
    }) as typeof fetch;

    const response = await GET(request("100"));
    expect(response.status).to.equal(502);
    expect(await response.json()).to.deep.equal({ error: "node unavailable" });
    expect(methods).to.deep.equal(["eth_chainId", "eth_call"]);
  });

  it("bounds an oversized provider response before JSON parsing", async function () {
    const methods: string[] = [];
    globalThis.fetch = (async (_input, init) => {
      const payload = JSON.parse(String(init?.body)) as { method: string };
      methods.push(payload.method);
      if (payload.method === "eth_chainId") {
        return new Response(JSON.stringify({ jsonrpc: "2.0", id: 0, result: "0x128" }), { status: 200 });
      }
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: `0x${"f".repeat(70_000)}` }), {
        status: 200,
      });
    }) as typeof fetch;

    const response = await GET(request("100"));
    expect(response.status).to.equal(502);
    expect(await response.json()).to.deep.equal({ error: "RPC response exceeds 65536 bytes" });
    expect(methods).to.deep.equal(["eth_chainId", "eth_call"]);
  });
});
