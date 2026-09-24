import { expect } from "chai";
import { Interface } from "ethers";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { POST } from "../../nextjs/app/api/quote/hcs/anchor/route";
import { matchesQuoteRecordedLog, quoteRecordedAbi } from "../../nextjs/utils/quoteHcs";
import {
  loadHcsOperatorKey,
  matchesHcsOperatorMirrorAccount,
  matchesHcsTopicSubmitKey,
} from "../../nextjs/utils/quoteHcsOperator";
import type { QuoteReceiptJson } from "../utils/quoteReceipt";

const receipt = JSON.parse(
  readFileSync(resolve(__dirname, "../../../examples/receipt-testnet.json"), "utf8"),
) as QuoteReceiptJson;
const transactionHash = "0x076690438e81f96fc77f3f6467157d2f53c05703ef098790a42b82909a340ef9";

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
      evm_address: "0x7e5f4552091a69125d5dfcb7b8c2659029395bdf",
      deleted: false,
    };
    expect(matchesHcsOperatorMirrorAccount(account, "0.0.123", key)).to.equal(true);
    expect(
      matchesHcsOperatorMirrorAccount({ ...account, evm_address: "0x" + "0".repeat(40) }, "0.0.123", key),
    ).to.equal(false);
    expect(matchesHcsOperatorMirrorAccount({ ...account, account: "0.0.999" }, "0.0.123", key)).to.equal(false);
    expect(() => loadHcsOperatorKey("1".repeat(64))).to.throw("Invalid HCS operator key format");
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
      expect(response.status).to.equal(503);
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
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
