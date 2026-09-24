import { expect } from "chai";
import { Interface } from "ethers";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { POST } from "../../nextjs/app/api/quote/hcs/anchor/route";
import { matchesQuoteRecordedLog, quoteRecordedAbi } from "../../nextjs/utils/quoteHcs";
import { hcsSdk } from "../../nextjs/utils/quoteHcsSdk";
import {
  checkHcsOperatorMirrorIdentity,
  loadHcsOperatorKey,
  matchesHcsOperatorMirrorAccount,
  matchesHcsTopicSubmitKey,
} from "../../nextjs/utils/quoteHcsOperator";
import type { QuoteReceiptJson } from "../utils/quoteReceipt";

const receipt = JSON.parse(
  readFileSync(resolve(__dirname, "../../../examples/receipt-testnet.json"), "utf8"),
) as QuoteReceiptJson;
const transactionHash = "0x076690438e81f96fc77f3f6467157d2f53c05703ef098790a42b82909a340ef9";

function requestBody(body: unknown, token?: string, length?: string): Request {
  const json = JSON.stringify(body);
  return new Request("http://localhost/api/quote/hcs/anchor", {
    method: "POST",
    headers: {
      "content-length": length ?? String(Buffer.byteLength(json)),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: json,
  });
}

describe("HCS anchor event gate", function () {
  it("loads an ECDSA key and matches only its exact Mirror submit key", function () {
    const key = loadHcsOperatorKey(`0x${"0".repeat(63)}1`);
    expect(`0x${key.publicKey.toEvmAddress().toLowerCase()}`).to.equal("0x7e5f4552091a69125d5dfcb7b8c2659029395bdf");
    const topic = { submit_key: { _type: "ECDSA_SECP256K1", key: key.publicKey.toStringRaw() } };
    expect(matchesHcsTopicSubmitKey(topic, key)).to.equal(true);
    expect(matchesHcsTopicSubmitKey({ submit_key: { ...topic.submit_key, key: "0".repeat(66) } }, key)).to.equal(false);
    expect(matchesHcsTopicSubmitKey({ submit_key: { ...topic.submit_key, _type: "ED25519" } }, key)).to.equal(false);
    const account = {
      account: "0.0.123",
      key: { _type: "ECDSA_SECP256K1", key: key.publicKey.toStringRaw() },
      deleted: false,
    };
    expect(matchesHcsOperatorMirrorAccount(account, "0.0.123", key)).to.equal(true);
    expect(
      matchesHcsOperatorMirrorAccount({ ...account, key: { ...account.key, key: "0".repeat(66) } }, "0.0.123", key),
    ).to.equal(false);
    expect(
      matchesHcsOperatorMirrorAccount({ ...account, key: { ...account.key, _type: "ED25519" } }, "0.0.123", key),
    ).to.equal(false);
    expect(matchesHcsOperatorMirrorAccount({ ...account, deleted: true }, "0.0.123", key)).to.equal(false);
    expect(matchesHcsOperatorMirrorAccount({ ...account, account: "0.0.999" }, "0.0.123", key)).to.equal(false);
    expect(() => loadHcsOperatorKey("1".repeat(64))).to.throw("Invalid HCS operator key format");
  });

  it("reads the operator key from Mirror without recent transactions", async function () {
    const key = loadHcsOperatorKey(`0x${"0".repeat(63)}1`);
    const originalFetch = globalThis.fetch;
    let requested = "";
    try {
      globalThis.fetch = async input => {
        requested = String(input);
        const json = JSON.stringify({
          account: "0.0.123",
          key: { _type: "ECDSA_SECP256K1", key: key.publicKey.toStringRaw() },
        });
        return new Response(json, { headers: { "content-length": String(Buffer.byteLength(json)) } });
      };
      expect(await checkHcsOperatorMirrorIdentity("0.0.123", key)).to.equal(true);
      expect(requested).to.equal("https://testnet.mirrornode.hedera.com/api/v1/accounts/0.0.123?transactions=false");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("matches all fields of a confirmed QuoteRecorded log", function () {
    const iface = new Interface(quoteRecordedAbi as never);
    const fragment = iface.getEvent("QuoteRecorded");
    if (!fragment) throw new Error("Missing event ABI");
    const fields = [
      "schemaVersion",
      "chainId",
      "registry",
      "issuer",
      "nonce",
      "cents",
      "oracle",
      "feedId",
      "roundId",
      "price",
      "decimals",
      "observedAt",
      "recordedAt",
      "maximumAge",
      "tinybars",
    ] as const;
    const values = fields.map(field =>
      ["registry", "issuer", "oracle", "feedId"].includes(field) ? receipt[field] : BigInt(receipt[field]),
    );
    const encoded = iface.encodeEventLog(fragment, [receipt.commitment, values]);
    const log = {
      address: receipt.registry,
      data: encoded.data as `0x${string}`,
      topics: encoded.topics as `0x${string}`[],
      logIndex: "0x0",
    };
    expect(matchesQuoteRecordedLog(log, receipt, receipt.registry)).to.equal(0);
    expect(matchesQuoteRecordedLog(log, { ...receipt, cents: "101" }, receipt.registry)).to.equal(undefined);
    expect(matchesQuoteRecordedLog({ ...log, address: receipt.issuer }, receipt, receipt.registry)).to.equal(undefined);
  });

  it("refuses anchoring without server configuration", async function () {
    const saved = {
      HCS_OPERATOR_ID: process.env.HCS_OPERATOR_ID,
      HCS_OPERATOR_KEY: process.env.HCS_OPERATOR_KEY,
      HCS_TOPIC_ID: process.env.HCS_TOPIC_ID,
      HCS_ANCHOR_TOKEN: process.env.HCS_ANCHOR_TOKEN,
    };
    try {
      delete process.env.HCS_OPERATOR_ID;
      delete process.env.HCS_OPERATOR_KEY;
      delete process.env.HCS_TOPIC_ID;
      delete process.env.HCS_ANCHOR_TOKEN;
      const response = await POST(
        new Request("http://localhost/api/quote/hcs/anchor", {
          method: "POST",
          body: JSON.stringify({ receipt, transactionHash }),
        }),
      );
      expect(response.status).to.equal(401);
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it("rejects invalid and oversized authenticated bodies before RPC", async function () {
    const saved = {
      HCS_OPERATOR_ID: process.env.HCS_OPERATOR_ID,
      HCS_OPERATOR_KEY: process.env.HCS_OPERATOR_KEY,
      HCS_TOPIC_ID: process.env.HCS_TOPIC_ID,
      HCS_ANCHOR_TOKEN: process.env.HCS_ANCHOR_TOKEN,
    };
    const originalFetch = globalThis.fetch;
    let calls = 0;
    try {
      process.env.HCS_OPERATOR_ID = "0.0.123";
      process.env.HCS_OPERATOR_KEY = `0x${"0".repeat(63)}1`;
      process.env.HCS_TOPIC_ID = "0.0.456";
      process.env.HCS_ANCHOR_TOKEN = "test-only-token";
      globalThis.fetch = async () => {
        calls++;
        throw new Error("Network must not be reached");
      };
      for (const [length, status] of [
        ["invalid", 400],
        ["65537", 413],
      ] as const) {
        const response = await POST(requestBody({ receipt, transactionHash }, "test-only-token", length));
        expect(response.status).to.equal(status);
      }
      const withoutLength = new Request("http://localhost/api/quote/hcs/anchor", {
        method: "POST",
        headers: { authorization: "Bearer test-only-token" },
        body: JSON.stringify({ receipt, transactionHash }),
      });
      expect((await POST(withoutLength)).status).to.equal(411);
      expect(calls).to.equal(0);
    } finally {
      globalThis.fetch = originalFetch;
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it("returns 503 on operator-key mismatch, then a pending transaction ID after a mocked submit", async function () {
    const key = loadHcsOperatorKey(`0x${"0".repeat(63)}1`);
    const iface = new Interface(quoteRecordedAbi as never);
    const fragment = iface.getEvent("QuoteRecorded");
    if (!fragment) throw new Error("Missing event ABI");
    const fields = [
      "schemaVersion",
      "chainId",
      "registry",
      "issuer",
      "nonce",
      "cents",
      "oracle",
      "feedId",
      "roundId",
      "price",
      "decimals",
      "observedAt",
      "recordedAt",
      "maximumAge",
      "tinybars",
    ] as const;
    const values = fields.map(field =>
      ["registry", "issuer", "oracle", "feedId"].includes(field) ? receipt[field] : BigInt(receipt[field]),
    );
    const encoded = iface.encodeEventLog(fragment, [receipt.commitment, values]);
    const savedEnv = Object.fromEntries(
      ["HCS_OPERATOR_ID", "HCS_OPERATOR_KEY", "HCS_TOPIC_ID", "HCS_ANCHOR_TOKEN", "HCS_ANCHOR_DISABLED"].map(name => [
        name,
        process.env[name],
      ]),
    );
    const originalFetch = globalThis.fetch;
    const originalInfo = console.info;
    const originalError = console.error;
    const clientDescriptor = Object.getOwnPropertyDescriptor(hcsSdk.Client, "forTestnet");
    const prototype = hcsSdk.TopicMessageSubmitTransaction.prototype;
    const methodNames = ["setTopicId", "setMessage", "freezeWith", "sign", "execute"] as const;
    const descriptors = methodNames.map(name => [name, Object.getOwnPropertyDescriptor(prototype, name)] as const);
    const logged: unknown[][] = [];
    const hcsTransactionId = "0.0.123@1234567890.000000001";
    let accountKeyMatches = false;
    const jsonResponse = (data: unknown): Response => {
      const json = JSON.stringify(data);
      return new Response(json, { headers: { "content-length": String(Buffer.byteLength(json)) } });
    };
    try {
      process.env.HCS_OPERATOR_ID = "0.0.123";
      process.env.HCS_OPERATOR_KEY = `0x${"0".repeat(63)}1`;
      process.env.HCS_TOPIC_ID = "0.0.456";
      process.env.HCS_ANCHOR_TOKEN = "test-only-token";
      delete process.env.HCS_ANCHOR_DISABLED;
      console.info = (...args: unknown[]) => {
        logged.push(args);
      };
      console.error = (...args: unknown[]) => {
        logged.push(args);
      };
      globalThis.fetch = async (_input, init) => {
        const url = String(_input);
        if (url.includes("/accounts/"))
          return jsonResponse({
            account: "0.0.123",
            key: { _type: "ECDSA_SECP256K1", key: accountKeyMatches ? key.publicKey.toStringRaw() : "0".repeat(66) },
          });
        if (url.includes("/topics/"))
          return jsonResponse({ submit_key: { _type: "ECDSA_SECP256K1", key: key.publicKey.toStringRaw() } });
        const body = JSON.parse(String(init?.body)) as { method: string };
        if (body.method === "eth_chainId") return jsonResponse({ result: "0x128" });
        if (body.method === "eth_getTransactionReceipt")
          return jsonResponse({
            result: {
              status: "0x1",
              transactionHash,
              logs: [{ address: receipt.registry, data: encoded.data, topics: encoded.topics, logIndex: "0x0" }],
            },
          });
        throw new Error("Unexpected fetch");
      };
      Object.defineProperty(hcsSdk.Client, "forTestnet", {
        configurable: true,
        value: () => ({
          setOperator() {
            return this;
          },
          close() {},
        }),
      });
      for (const name of ["setTopicId", "setMessage", "freezeWith"] as const) {
        Object.defineProperty(prototype, name, {
          configurable: true,
          value: function () {
            return this;
          },
        });
      }
      Object.defineProperty(prototype, "sign", {
        configurable: true,
        value: async function () {
          return this;
        },
      });
      Object.defineProperty(prototype, "execute", {
        configurable: true,
        value: async () => ({
          transactionId: { toString: () => hcsTransactionId },
          getReceipt: async () => {
            throw new Error("Confirmation timed out");
          },
        }),
      });
      const mismatch = await POST(requestBody({ receipt, transactionHash }, "test-only-token"));
      expect(mismatch.status).to.equal(503);
      expect(process.env.HCS_ANCHOR_DISABLED).to.equal(undefined);
      accountKeyMatches = true;
      const response = await POST(requestBody({ receipt, transactionHash }, "test-only-token"));
      expect(response.status).to.equal(502);
      expect((await response.json()).hcsAnchor).to.deep.equal({ status: "pending", hcsTransactionId });
      expect(JSON.stringify(logged)).to.contain(hcsTransactionId);
      expect(process.env.HCS_ANCHOR_DISABLED).to.equal(undefined);
    } finally {
      globalThis.fetch = originalFetch;
      console.info = originalInfo;
      console.error = originalError;
      if (clientDescriptor) Object.defineProperty(hcsSdk.Client, "forTestnet", clientDescriptor);
      for (const [name, descriptor] of descriptors) {
        if (descriptor) Object.defineProperty(prototype, name, descriptor);
        else delete (prototype as unknown as Record<string, unknown>)[name];
      }
      for (const [name, value] of Object.entries(savedEnv)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });

  it("requires route authorization before any RPC or HCS call", async function () {
    const saved = {
      HCS_OPERATOR_ID: process.env.HCS_OPERATOR_ID,
      HCS_OPERATOR_KEY: process.env.HCS_OPERATOR_KEY,
      HCS_TOPIC_ID: process.env.HCS_TOPIC_ID,
      HCS_ANCHOR_TOKEN: process.env.HCS_ANCHOR_TOKEN,
    };
    const originalFetch = globalThis.fetch;
    let calls = 0;
    try {
      process.env.HCS_OPERATOR_ID = "0.0.123";
      process.env.HCS_OPERATOR_KEY = "0x" + "1".repeat(64);
      process.env.HCS_TOPIC_ID = "0.0.456";
      process.env.HCS_ANCHOR_TOKEN = "test-only-token";
      globalThis.fetch = async () => {
        calls++;
        throw new Error("Network must not be reached");
      };
      const response = await POST(
        new Request("http://localhost/api/quote/hcs/anchor", {
          method: "POST",
          body: JSON.stringify({ receipt, transactionHash }),
        }),
      );
      expect(response.status).to.equal(401);
      expect(calls).to.equal(0);
    } finally {
      globalThis.fetch = originalFetch;
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
