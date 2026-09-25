import { expect } from "chai";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { POST } from "../../nextjs/app/api/quote/hcs/verify/route";
import { compareHcsMirrorMessage, makeHcsAnchor } from "../../nextjs/utils/quoteHcs";
import { REFERENCE_MAX_AGE, computeReceiptCommitment, type QuoteReceiptJson } from "../utils/quoteReceipt";

const historicalReceipt = JSON.parse(
  readFileSync(resolve(__dirname, "../../../examples/receipt-testnet.json"), "utf8"),
) as QuoteReceiptJson;
const receipt = { ...historicalReceipt, maximumAge: REFERENCE_MAX_AGE.toString() };
receipt.commitment = computeReceiptCommitment(receipt);
const transactionHash = "0x076690438e81f96fc77f3f6467157d2f53c05703ef098790a42b82909a340ef9";
const topicId = "0.0.456";
const operatorId = "0.0.123";
const sequenceNumber = 7;
const anchor = makeHcsAnchor(receipt, transactionHash, 0);
const message = Buffer.from(JSON.stringify(anchor)).toString("base64");

function requestBody(body: unknown): Request {
  const json = JSON.stringify(body);
  return new Request("http://localhost/api/quote/hcs/verify", {
    method: "POST",
    headers: { "content-length": String(Buffer.byteLength(json)) },
    body: json,
  });
}

function mirrorResponse(data: unknown): Response {
  const json = JSON.stringify(data);
  return new Response(json, { headers: { "content-length": String(Buffer.byteLength(json)) } });
}

describe("HCS Mirror read-back", function () {
  it("uses pinned public IDs for the historical topic with no HCS environment", async function () {
    const savedTopic = process.env.HCS_TOPIC_ID;
    const savedOperator = process.env.HCS_OPERATOR_ID;
    const originalFetch = globalThis.fetch;
    const urls: string[] = [];
    try {
      delete process.env.HCS_TOPIC_ID;
      delete process.env.HCS_OPERATOR_ID;
      globalThis.fetch = async input => {
        urls.push(String(input));
        return mirrorResponse({
          topic_id: "0.0.10698279",
          sequence_number: 1,
          payer_account_id: "0.0.10696998",
          message,
        });
      };
      const response = await POST(
        requestBody({ receipt, transactionHash, logIndex: 0, topicId: "0.0.10698279", sequenceNumber: 1 }),
      );
      expect((await response.json()).hcsAnchor.status).to.equal("match");
      expect(urls).to.deep.equal(["https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.10698279/messages/1"]);
    } finally {
      globalThis.fetch = originalFetch;
      if (savedTopic === undefined) delete process.env.HCS_TOPIC_ID;
      else process.env.HCS_TOPIC_ID = savedTopic;
      if (savedOperator === undefined) delete process.env.HCS_OPERATOR_ID;
      else process.env.HCS_OPERATOR_ID = savedOperator;
    }
  });

  it("does not use historical defaults when either environment setting is present", async function () {
    const savedTopic = process.env.HCS_TOPIC_ID;
    const savedOperator = process.env.HCS_OPERATOR_ID;
    const originalFetch = globalThis.fetch;
    let calls = 0;
    try {
      process.env.HCS_TOPIC_ID = "0.0.999";
      delete process.env.HCS_OPERATOR_ID;
      globalThis.fetch = async () => {
        calls++;
        throw new Error("Mirror should not be called");
      };
      const request = requestBody({
        receipt,
        transactionHash,
        logIndex: 0,
        topicId: "0.0.10698279",
        sequenceNumber: 1,
      });
      expect((await (await POST(request)).json()).hcsAnchor.status).to.equal("not_configured");
      process.env.HCS_OPERATOR_ID = "0.0.888";
      const configuredRequest = requestBody({
        receipt,
        transactionHash,
        logIndex: 0,
        topicId: "0.0.10698279",
        sequenceNumber: 1,
      });
      expect((await (await POST(configuredRequest)).json()).hcsAnchor.status).to.equal("mismatch");
      expect(calls).to.equal(0);
    } finally {
      globalThis.fetch = originalFetch;
      if (savedTopic === undefined) delete process.env.HCS_TOPIC_ID;
      else process.env.HCS_TOPIC_ID = savedTopic;
      if (savedOperator === undefined) delete process.env.HCS_OPERATOR_ID;
      else process.env.HCS_OPERATOR_ID = savedOperator;
    }
  });

  it("rejects a foreign payer under the pinned historical fallback", async function () {
    const savedTopic = process.env.HCS_TOPIC_ID;
    const savedOperator = process.env.HCS_OPERATOR_ID;
    const originalFetch = globalThis.fetch;
    try {
      delete process.env.HCS_TOPIC_ID;
      delete process.env.HCS_OPERATOR_ID;
      globalThis.fetch = async () =>
        mirrorResponse({
          topic_id: "0.0.10698279",
          sequence_number: 1,
          payer_account_id: "0.0.999",
          message,
        });
      const response = await POST(
        requestBody({ receipt, transactionHash, logIndex: 0, topicId: "0.0.10698279", sequenceNumber: 1 }),
      );
      expect((await response.json()).hcsAnchor.status).to.equal("mismatch");
    } finally {
      globalThis.fetch = originalFetch;
      if (savedTopic === undefined) delete process.env.HCS_TOPIC_ID;
      else process.env.HCS_TOPIC_ID = savedTopic;
      if (savedOperator === undefined) delete process.env.HCS_OPERATOR_ID;
      else process.env.HCS_OPERATOR_ID = savedOperator;
    }
  });

  it("reports not configured without contacting Mirror when HCS settings are absent", async function () {
    const savedTopic = process.env.HCS_TOPIC_ID;
    const savedOperator = process.env.HCS_OPERATOR_ID;
    const originalFetch = globalThis.fetch;
    let calls = 0;
    try {
      delete process.env.HCS_TOPIC_ID;
      delete process.env.HCS_OPERATOR_ID;
      globalThis.fetch = async () => {
        calls++;
        throw new Error("Mirror should not be called");
      };
      const response = await POST(requestBody({ receipt, transactionHash, logIndex: 0, topicId, sequenceNumber }));
      expect(response.status).to.equal(200);
      expect((await response.json()).hcsAnchor.status).to.equal("not_configured");
      expect(calls).to.equal(0);
    } finally {
      globalThis.fetch = originalFetch;
      if (savedTopic === undefined) delete process.env.HCS_TOPIC_ID;
      else process.env.HCS_TOPIC_ID = savedTopic;
      if (savedOperator === undefined) delete process.env.HCS_OPERATOR_ID;
      else process.env.HCS_OPERATOR_ID = savedOperator;
    }
  });

  it("rejects a share reference to a different topic before contacting Mirror", async function () {
    const savedTopic = process.env.HCS_TOPIC_ID;
    const savedOperator = process.env.HCS_OPERATOR_ID;
    const originalFetch = globalThis.fetch;
    let calls = 0;
    try {
      process.env.HCS_TOPIC_ID = topicId;
      process.env.HCS_OPERATOR_ID = operatorId;
      globalThis.fetch = async () => {
        calls++;
        throw new Error("Mirror should not be called");
      };
      const response = await POST(
        requestBody({ receipt, transactionHash, logIndex: 0, topicId: "0.0.999", sequenceNumber }),
      );
      expect(response.status).to.equal(200);
      expect((await response.json()).hcsAnchor.status).to.equal("mismatch");
      expect(calls).to.equal(0);
    } finally {
      globalThis.fetch = originalFetch;
      if (savedTopic === undefined) delete process.env.HCS_TOPIC_ID;
      else process.env.HCS_TOPIC_ID = savedTopic;
      if (savedOperator === undefined) delete process.env.HCS_OPERATOR_ID;
      else process.env.HCS_OPERATOR_ID = savedOperator;
    }
  });

  it("verifies a message when the request and Mirror response omit Content-Length", async function () {
    const savedTopic = process.env.HCS_TOPIC_ID;
    const savedOperator = process.env.HCS_OPERATOR_ID;
    const originalFetch = globalThis.fetch;
    let calls = 0;
    try {
      process.env.HCS_TOPIC_ID = topicId;
      process.env.HCS_OPERATOR_ID = operatorId;
      globalThis.fetch = async () => {
        calls++;
        return new Response(
          JSON.stringify({
            topic_id: topicId,
            sequence_number: sequenceNumber,
            payer_account_id: operatorId,
            message,
          }),
        );
      };
      const response = await POST(
        new Request("http://localhost/api/quote/hcs/verify", {
          method: "POST",
          body: JSON.stringify({ receipt, transactionHash, logIndex: 0, topicId, sequenceNumber }),
        }),
      );
      expect(response.status).to.equal(200);
      expect((await response.json()).hcsAnchor.status).to.equal("match");
      expect(calls).to.equal(1);
    } finally {
      globalThis.fetch = originalFetch;
      if (savedTopic === undefined) delete process.env.HCS_TOPIC_ID;
      else process.env.HCS_TOPIC_ID = savedTopic;
      if (savedOperator === undefined) delete process.env.HCS_OPERATOR_ID;
      else process.env.HCS_OPERATOR_ID = savedOperator;
    }
  });
  it("matches an exact message paid by the configured server account", function () {
    expect(
      compareHcsMirrorMessage(
        { topic_id: topicId, sequence_number: sequenceNumber, payer_account_id: operatorId, message },
        anchor,
        topicId,
        sequenceNumber,
        operatorId,
      ).status,
    ).to.equal("match");
  });

  it("rejects a foreign submitter even when the message bytes are genuine", function () {
    const compared = compareHcsMirrorMessage(
      {
        topic_id: topicId,
        sequence_number: sequenceNumber,
        payer_account_id: "0.0.999",
        message,
      },
      anchor,
      topicId,
      sequenceNumber,
      operatorId,
    );
    expect(compared.status).to.equal("mismatch");
    expect(compared.reason).to.contain("payer");
  });

  it("rejects missing payer, changed content and wrong topic", function () {
    const common = { topic_id: topicId, sequence_number: sequenceNumber, payer_account_id: operatorId, message };
    expect(
      compareHcsMirrorMessage({ ...common, payer_account_id: undefined }, anchor, topicId, sequenceNumber, operatorId)
        .status,
    ).to.equal("mismatch");
    expect(
      compareHcsMirrorMessage(
        { ...common, message: Buffer.from(JSON.stringify({ ...anchor, nonce: "1" })).toString("base64") },
        anchor,
        topicId,
        sequenceNumber,
        operatorId,
      ).status,
    ).to.equal("mismatch");
    expect(
      compareHcsMirrorMessage({ ...common, topic_id: "0.0.999" }, anchor, topicId, sequenceNumber, operatorId).status,
    ).to.equal("mismatch");
  });

  it("reads only the Mirror message and accepts its configured payer without a topic metadata check", async function () {
    const savedTopic = process.env.HCS_TOPIC_ID;
    const savedOperator = process.env.HCS_OPERATOR_ID;
    const originalFetch = globalThis.fetch;
    const urls: string[] = [];
    try {
      process.env.HCS_TOPIC_ID = topicId;
      process.env.HCS_OPERATOR_ID = operatorId;
      globalThis.fetch = async input => {
        urls.push(String(input));
        return mirrorResponse({
          topic_id: topicId,
          sequence_number: sequenceNumber,
          payer_account_id: operatorId,
          message,
        });
      };
      const response = await POST(requestBody({ receipt, transactionHash, logIndex: 0, topicId, sequenceNumber }));
      expect((await response.json()).hcsAnchor.status).to.equal("match");
      expect(urls).to.deep.equal([
        `https://testnet.mirrornode.hedera.com/api/v1/topics/${topicId}/messages/${sequenceNumber}`,
      ]);
    } finally {
      globalThis.fetch = originalFetch;
      if (savedTopic === undefined) delete process.env.HCS_TOPIC_ID;
      else process.env.HCS_TOPIC_ID = savedTopic;
      if (savedOperator === undefined) delete process.env.HCS_OPERATOR_ID;
      else process.env.HCS_OPERATOR_ID = savedOperator;
    }
  });

  it("returns a separate mismatch for a foreign-payer Mirror response", async function () {
    const savedTopic = process.env.HCS_TOPIC_ID;
    const savedOperator = process.env.HCS_OPERATOR_ID;
    const originalFetch = globalThis.fetch;
    const urls: string[] = [];
    try {
      process.env.HCS_TOPIC_ID = topicId;
      process.env.HCS_OPERATOR_ID = operatorId;
      globalThis.fetch = async input => {
        urls.push(String(input));
        return mirrorResponse({
          topic_id: topicId,
          sequence_number: sequenceNumber,
          payer_account_id: "0.0.999",
          message,
        });
      };
      const response = await POST(requestBody({ receipt, transactionHash, logIndex: 0, sequenceNumber }));
      expect((await response.json()).hcsAnchor.status).to.equal("mismatch");
      expect(urls).to.have.length(1);
      expect(urls.every(url => url.startsWith("https://testnet.mirrornode.hedera.com/api/v1/topics/"))).to.equal(true);
    } finally {
      globalThis.fetch = originalFetch;
      if (savedTopic === undefined) delete process.env.HCS_TOPIC_ID;
      else process.env.HCS_TOPIC_ID = savedTopic;
      if (savedOperator === undefined) delete process.env.HCS_OPERATOR_ID;
      else process.env.HCS_OPERATOR_ID = savedOperator;
    }
  });
});
