import { expect } from "chai";
import { resolveVerificationOptions } from "../scripts/verifyQuote";
import { validateQuoteCreateNetwork } from "../scripts/runHardhatQuoteCreateWithPK";

describe("QuoteProof script guards", function () {
  it("rejects create-only wrapper networks before password handling", function () {
    expect(() => validateQuoteCreateNetwork(undefined)).to.throw("testnet-only");
    expect(() => validateQuoteCreateNetwork("hardhat")).to.throw("testnet-only");
    expect(validateQuoteCreateNetwork("hederaTestnet")).to.equal("hederaTestnet");
  });

  it("requires deployment context by default and makes foreign mode explicit", function () {
    const options = resolveVerificationOptions([
      "--input",
      "receipt.json",
      "--expected-registry",
      "0x0000000000000000000000000000000000000001",
      "--expected-oracle",
      "0x0000000000000000000000000000000000000002",
    ]);
    expect(options).to.deep.equal({
      expectedChainId: 296n,
      expectedRegistry: "0x0000000000000000000000000000000000000001",
      expectedOracle: "0x0000000000000000000000000000000000000002",
      expectedIssuer: undefined,
    });
    expect(resolveVerificationOptions(["--input", "receipt.json", "--allow-foreign-context"])).to.deep.equal({
      expectedChainId: undefined,
      expectedRegistry: undefined,
      expectedOracle: undefined,
      expectedIssuer: undefined,
    });
  });
});
