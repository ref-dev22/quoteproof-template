import { expect } from "chai";
import { AbiCoder, keccak256 } from "ethers";
import {
  FEED_ID,
  computeReceiptCommitment,
  parseReceiptJson,
  verifyReceiptObject,
  type QuoteReceiptJson,
} from "../utils/quoteReceipt";

function makeReceipt(overrides: Partial<QuoteReceiptJson> = {}): QuoteReceiptJson {
  const receipt: QuoteReceiptJson = {
    schemaVersion: "1",
    chainId: "31337",
    registry: "0x0000000000000000000000000000000000000001",
    issuer: "0x0000000000000000000000000000000000000002",
    nonce: "0",
    cents: "100",
    oracle: "0x0000000000000000000000000000000000000003",
    feedId: FEED_ID,
    roundId: "7",
    price: "10000000",
    decimals: "8",
    observedAt: "1000000",
    recordedAt: "1000100",
    maximumAge: "93600",
    tinybars: "1000000000",
    commitment: "0x0000000000000000000000000000000000000000000000000000000000000000",
  };
  const merged = { ...receipt, ...overrides };
  merged.commitment = computeReceiptCommitment(merged);
  return merged;
}

describe("standalone quote receipt verifier", function () {
  it("accepts a valid calculation-checked receipt", function () {
    const receipt = makeReceipt();
    const result = verifyReceiptObject(receipt, {
      expectedChainId: 31337n,
      expectedRegistry: receipt.registry,
      expectedOracle: receipt.oracle,
    });
    expect(result.valid).to.equal(true);
    expect(result.level).to.equal("calculation-checked");
    expect(result.expectedTinybars).to.equal("1000000000");
  });

  it("rejects altered bound fields and malformed schema fields", function () {
    const receipt = makeReceipt({ cents: "101" });
    const altered = verifyReceiptObject({ ...receipt, cents: "102" }, { expectedChainId: 31337n });
    expect(altered.valid).to.equal(false);
    expect(altered.errors).to.include("tinybars does not match independent ceiling arithmetic");
    expect(altered.errors).to.include("commitment does not match the receipt fields");

    expect(() => parseReceiptJson(JSON.stringify({ ...receipt, explorerUrl: "https://evil.example" }))).to.throw(
      "unknown receipt fields",
    );
    expect(() => parseReceiptJson(JSON.stringify({ ...receipt, cents: 100 }))).to.not.throw();
    const malformed = { ...receipt, cents: "1e2" };
    const malformedResult = verifyReceiptObject(malformed);
    expect(malformedResult.valid).to.equal(false);
    expect(malformedResult.errors[0]).to.contain("cents must be a non-negative decimal integer string");
  });

  it("rejects an unexpected network without needing a signer", function () {
    const receipt = makeReceipt();
    const result = verifyReceiptObject(receipt, { expectedChainId: 296n });
    expect(result.valid).to.equal(false);
    expect(result.errors[0]).to.contain("unexpected chainId");
  });

  it("rejects oversized imports and a recomputed lookalike registry", function () {
    const receipt = makeReceipt();
    const lookalike = makeReceipt({ registry: "0x0000000000000000000000000000000000000004" });
    const result = verifyReceiptObject(lookalike, {
      expectedChainId: 31337n,
      expectedRegistry: receipt.registry,
      expectedOracle: receipt.oracle,
    });
    expect(result.valid).to.equal(false);
    expect(result.errors).to.include("registry does not match the configured deployment");

    const oversized = JSON.stringify({ ...receipt, padding: "x".repeat(70_000) });
    expect(() => parseReceiptJson(oversized)).to.throw("exceeds");
  });

  it("uses the same ABI tuple shape as the registry commitment", function () {
    const receipt = makeReceipt();
    const encoded = AbiCoder.defaultAbiCoder().encode(
      [
        "tuple(uint256,uint256,address,address,uint256,uint256,address,bytes32,uint80,uint256,uint8,uint256,uint256,uint256,uint256)",
      ],
      [
        [
          receipt.schemaVersion,
          receipt.chainId,
          receipt.registry,
          receipt.issuer,
          receipt.nonce,
          receipt.cents,
          receipt.oracle,
          receipt.feedId,
          receipt.roundId,
          receipt.price,
          receipt.decimals,
          receipt.observedAt,
          receipt.recordedAt,
          receipt.maximumAge,
          receipt.tinybars,
        ],
      ],
    );
    expect(keccak256(encoded)).to.equal(receipt.commitment);
  });
});
