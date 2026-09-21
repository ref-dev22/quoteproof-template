import { expect } from "chai";
import { AbiCoder, keccak256 } from "ethers";
import {
  FEED_ID,
  computeReceiptCommitment,
  parseReceiptJson,
  verifyReceiptObject,
  type QuoteReceiptJson,
} from "../utils/quoteReceipt";
import { compareExpectedQuote, compareStoredCommitment } from "../utils/quoteReceiptComparison";

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
      expectedIssuer: receipt.issuer,
    });
    expect(result.valid).to.equal(true);
    expect(result.level).to.equal("calculation-checked");
    expect(result.expectedTinybars).to.equal("1000000000");
    expect(result.onChainVerified).to.equal(false);
    expect(result.checks).to.deep.equal({
      expectedChainId: true,
      expectedRegistry: true,
      expectedOracle: true,
      expectedIssuer: true,
      feedId: true,
      arithmetic: true,
      commitment: true,
    });
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
      expectedIssuer: receipt.issuer,
    });
    expect(result.valid).to.equal(false);
    expect(result.errors).to.include("registry does not match the configured deployment");

    const issuerLookalike = makeReceipt({ issuer: "0x0000000000000000000000000000000000000005" });
    const issuerResult = verifyReceiptObject(issuerLookalike, {
      expectedChainId: 31337n,
      expectedRegistry: receipt.registry,
      expectedOracle: receipt.oracle,
      expectedIssuer: receipt.issuer,
    });
    expect(issuerResult.errors).to.include("issuer does not match the configured transaction sender");

    const oversized = JSON.stringify({ ...receipt, padding: "x".repeat(70_000) });
    expect(() => parseReceiptJson(oversized)).to.throw("exceeds");
  });

  it("returns structured invalid results for hostile zero-address and ABI-range inputs", function () {
    const receipt = makeReceipt();
    const hostileCases: Array<[keyof QuoteReceiptJson, string, string]> = [
      ["registry", "0x0000000000000000000000000000000000000000", "registry must not be the zero address"],
      ["issuer", "0x0000000000000000000000000000000000000000", "issuer must not be the zero address"],
      ["oracle", "0x0000000000000000000000000000000000000000", "oracle must not be the zero address"],
      ["decimals", "256", "decimals exceeds uint8 ABI range"],
      ["roundId", (2n ** 80n).toString(), "roundId exceeds uint80 ABI range"],
      ["price", (2n ** 256n).toString(), "price exceeds uint256 ABI range"],
    ];

    for (const [field, value, expectedError] of hostileCases) {
      const result = verifyReceiptObject({ ...receipt, [field]: value });
      expect(result.valid, field).to.equal(false);
      expect(result.errors, field).to.include(expectedError);
    }
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

  it("separates a consistently forged receipt from the stored commitment", function () {
    const genuine = makeReceipt();
    const forged = makeReceipt({ cents: "125", tinybars: "1250000000" });
    const local = verifyReceiptObject(forged, {
      expectedChainId: 31337n,
      expectedRegistry: genuine.registry,
      expectedOracle: genuine.oracle,
      expectedIssuer: genuine.issuer,
    });

    expect(local.valid).to.equal(true);
    expect(local.level).to.equal("calculation-checked");
    expect(forged.commitment).to.not.equal(genuine.commitment);
    expect(compareStoredCommitment(forged.commitment, genuine.commitment)).to.deep.equal({
      status: "mismatch",
      storedCommitment: genuine.commitment,
    });
    expect(compareStoredCommitment(genuine.commitment, genuine.commitment).status).to.equal("match");
    expect(compareStoredCommitment(genuine.commitment, `0x${"0".repeat(64)}`).status).to.equal("not_found");
  });

  it("requires an independent expected quote reference and rejects a genuine different quote", function () {
    const quoteA = makeReceipt();
    const quoteB = makeReceipt({
      issuer: "0x0000000000000000000000000000000000000004",
      nonce: "1",
      cents: "125",
      tinybars: "1250000000",
    });
    expect(verifyReceiptObject(quoteA, { expectedChainId: 31337n }).valid).to.equal(true);
    expect(verifyReceiptObject(quoteB, { expectedChainId: 31337n }).valid).to.equal(true);
    expect(compareStoredCommitment(quoteA.commitment, quoteA.commitment).status).to.equal("match");
    expect(compareStoredCommitment(quoteB.commitment, quoteB.commitment).status).to.equal("match");

    expect(compareExpectedQuote(quoteA, undefined)).to.deep.equal({
      status: "not_supplied",
      message: "No independent expected quote reference was supplied",
    });
    const incomplete = compareExpectedQuote(quoteA, { commitment: quoteA.commitment });
    expect(incomplete.status).to.equal("not_checked");
    if (incomplete.status === "not_checked") {
      expect(incomplete.errors).to.deep.equal(["expected issuer is required", "expected nonce is required"]);
    }
    expect(
      compareExpectedQuote(quoteA, { commitment: quoteA.commitment, issuer: quoteA.issuer, nonce: quoteA.nonce })
        .status,
    ).to.equal("match");
    const rejected = compareExpectedQuote(quoteB, {
      commitment: quoteA.commitment,
      issuer: quoteA.issuer,
      nonce: quoteA.nonce,
    });
    expect(rejected.status).to.equal("mismatch");
    if (rejected.status === "mismatch") {
      expect(rejected.errors).to.have.length(3);
      expect(rejected.errors.join("; ")).to.contain("independent expected commitment");
    }
  });
});
