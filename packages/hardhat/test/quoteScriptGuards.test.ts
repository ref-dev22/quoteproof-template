import { expect } from "chai";
import { readOnlyComparisonFailed, resolveVerificationOptions } from "../scripts/verifyQuote";
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

  it("rejects every requested stored or historical non-success status while leaving optional checks non-fatal", function () {
    const storedMatch = { status: "match" as const, storedCommitment: `0x${"1".repeat(64)}` };
    const historicalMatch = {
      status: "match" as const,
      requestedRoundId: "7",
      returnedRoundId: "7",
      returnedPrice: "1",
      returnedObservedAt: "2",
      currentDecimals: "8",
    };

    expect(
      readOnlyComparisonFailed(
        false,
        { status: "not_found", storedCommitment: `0x${"0".repeat(64)}` },
        {
          status: "not_checked",
          requestedRoundId: "7",
        },
      ),
    ).to.equal(false);
    expect(
      readOnlyComparisonFailed(
        true,
        { status: "mismatch", storedCommitment: storedMatch.storedCommitment },
        historicalMatch,
      ),
    ).to.equal(true);
    expect(
      readOnlyComparisonFailed(true, { status: "not_found", storedCommitment: `0x${"0".repeat(64)}` }, historicalMatch),
    ).to.equal(true);
    expect(readOnlyComparisonFailed(true, { status: "not_run", error: "context missing" }, historicalMatch)).to.equal(
      true,
    );
    expect(
      readOnlyComparisonFailed(true, storedMatch, {
        status: "mismatch",
        requestedRoundId: "7",
        returnedRoundId: "8",
        returnedPrice: "1",
        returnedObservedAt: "2",
        currentDecimals: "8",
      }),
    ).to.equal(true);
    expect(
      readOnlyComparisonFailed(true, storedMatch, {
        status: "unavailable",
        requestedRoundId: "7",
        error: "RPC failed",
      }),
    ).to.equal(true);
    expect(readOnlyComparisonFailed(true, storedMatch, { status: "not_checked", requestedRoundId: "7" })).to.equal(
      true,
    );
    expect(readOnlyComparisonFailed(true, storedMatch, historicalMatch)).to.equal(false);
  });
});
