import { expect } from "chai";
import genuineFixture from "../../../examples/adversarial/genuine.json";
import { REFERENCE_MAX_AGE, parseReceiptJson, verifyReceiptObject } from "../utils/quoteReceipt";
import {
  compareExpectedQuote,
  compareHistoricalOracle,
  compareStoredCommitment,
} from "../utils/quoteReceiptComparison";
import { makeHcsAnchor } from "../../nextjs/utils/quoteHcs";
import { checkTone } from "../../nextjs/utils/quoteCheckVisual";
import { displayedHcsAnchorStatus, hcsAnchorStatusLabel } from "../../nextjs/utils/quoteHcsReference";
import {
  FORGE_CASES,
  forgeCheckExplanation,
  forgeDisplayState,
  forgeReceipt,
  forgeRunReducer,
  initialForgeRunState,
  isHistoricalForgeReceipt,
} from "../../nextjs/utils/quoteForge";

const transactionHash = "0x076690438e81f96fc77f3f6467157d2f53c05703ef098790a42b82909a340ef9";
const genuine = parseReceiptJson(JSON.stringify(genuineFixture));
const context = {
  expectedChainId: BigInt(genuine.chainId),
  expectedRegistry: genuine.registry,
  expectedOracle: genuine.oracle,
};
const expected = { commitment: genuine.commitment, issuer: genuine.issuer, nonce: genuine.nonce };
const observation = {
  roundId: genuine.roundId,
  price: genuine.price,
  observedAt: genuine.observedAt,
  decimals: genuine.decimals,
};

describe("historical receipt forge simulation", function () {
  it("offers prepared fixtures only for the historical commitment", function () {
    expect(isHistoricalForgeReceipt(genuine.commitment.toUpperCase())).to.equal(true);
    expect(isHistoricalForgeReceipt("0x0")).to.equal(false);
    expect(FORGE_CASES.map(item => item.id)).to.deep.equal(["tinybar", "amount", "price"]);
    expect(forgeReceipt("tinybar").tinybars).to.equal((BigInt(genuine.tinybars) + 1n).toString());
  });

  it("matches the demo when its bundled historical policy is active", function () {
    // The separate policy workshop intentionally changes the app's maximum age
    // without rewriting this historical fixture. It must then reject the old receipt.
    if (REFERENCE_MAX_AGE.toString() !== genuine.maximumAge) {
      expect(verifyReceiptObject(genuine, context).errors).to.include("maximumAge does not match the frozen policy");
      return;
    }
    expect(verifyReceiptObject(genuine, context).valid).to.equal(true);
    expect(compareExpectedQuote(genuine, expected).status).to.equal("match");
    expect(compareStoredCommitment(genuine.commitment, genuine.commitment).status).to.equal("match");
    expect(compareHistoricalOracle(genuine, observation).status).to.equal("match");

    const tinybar = parseReceiptJson(JSON.stringify(forgeReceipt("tinybar")));
    expect(verifyReceiptObject(tinybar, context).valid).to.equal(false);
    expect(compareExpectedQuote(tinybar, expected).status).to.equal("match");

    const amount = parseReceiptJson(JSON.stringify(forgeReceipt("amount")));
    expect(verifyReceiptObject(amount, context).valid).to.equal(true);
    expect(compareExpectedQuote(amount, expected).status).to.equal("mismatch");
    expect(compareStoredCommitment(amount.commitment, genuine.commitment).status).to.equal("mismatch");
    expect(compareHistoricalOracle(amount, observation).status).to.equal("match");
    expect(makeHcsAnchor(amount, transactionHash, 0)).not.to.deep.equal(makeHcsAnchor(genuine, transactionHash, 0));

    const price = parseReceiptJson(JSON.stringify(forgeReceipt("price")));
    expect(verifyReceiptObject(price, context).valid).to.equal(true);
    expect(compareExpectedQuote(price, expected).status).to.equal("mismatch");
    expect(compareStoredCommitment(price.commitment, genuine.commitment).status).to.equal("mismatch");
    expect(compareHistoricalOracle(price, observation).status).to.equal("mismatch");
    expect(makeHcsAnchor(price, transactionHash, 0)).not.to.deep.equal(makeHcsAnchor(genuine, transactionHash, 0));
  });

  it("keeps the HCS check neutral when a forged receipt fails local consistency", function () {
    const displayedTones = (local: string, stored: string, oracle: string, hcs: "invalid" | "mismatch") => [
      checkTone(local),
      checkTone(stored),
      checkTone(oracle),
      checkTone(displayedHcsAnchorStatus(local, hcs)),
    ];
    expect(displayedTones("invalid", "not_run", "not_checked", "invalid")).to.deep.equal([
      "error",
      "neutral",
      "neutral",
      "neutral",
    ]);
    expect(hcsAnchorStatusLabel(displayedHcsAnchorStatus("invalid", "invalid"))).to.equal("Not checked");
    expect(displayedTones("valid", "mismatch", "match", "mismatch")).to.deep.equal([
      "success",
      "error",
      "success",
      "error",
    ]);
    expect(displayedTones("valid", "mismatch", "mismatch", "mismatch")).to.deep.equal([
      "success",
      "error",
      "error",
      "error",
    ]);
  });

  it("distinguishes idle, running, forged, restored, and network-error states", function () {
    let state = initialForgeRunState;
    expect(forgeDisplayState(state)).to.equal("idle");
    state = forgeRunReducer(state, { type: "start", caseId: "amount" });
    expect(forgeDisplayState(state)).to.equal("running");
    state = forgeRunReducer(state, { type: "complete" });
    expect(forgeDisplayState(state)).to.equal("forged");
    state = forgeRunReducer(state, { type: "start", caseId: null });
    expect(forgeDisplayState(state)).to.equal("running");
    state = forgeRunReducer(state, { type: "complete" });
    expect(forgeDisplayState(state)).to.equal("restored");
    state = forgeRunReducer(state, { type: "start", caseId: "price" });
    state = forgeRunReducer(state, { type: "network_error" });
    expect(forgeDisplayState(state)).to.equal("network_error");
    expect(checkTone("unavailable")).to.equal("neutral");
    expect(forgeCheckExplanation("stored", "mismatch")).to.be.a("string");
    expect(forgeCheckExplanation("oracle", "mismatch")).to.be.a("string");
    expect(forgeCheckExplanation("hcs", "invalid")).to.be.a("string");
    expect(forgeCheckExplanation("hcs", "unavailable")).to.equal(undefined);
    expect(forgeDisplayState(forgeRunReducer(state, { type: "reset" }))).to.equal("idle");
  });
});
