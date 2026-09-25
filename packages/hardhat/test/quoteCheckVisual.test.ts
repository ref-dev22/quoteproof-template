import { expect } from "chai";
import { checkTone, shareAutoComparisonKey } from "../../nextjs/utils/quoteCheckVisual";

describe("quote check presentation", function () {
  it("distinguishes passing, failing, and unavailable checks", function () {
    for (const status of ["valid", "match"]) expect(checkTone(status)).to.equal("success");
    for (const status of ["invalid", "mismatch", "not_found", "wrong_context", "wrong_network"]) {
      expect(checkTone(status)).to.equal("error");
    }
    for (const status of [
      "not_configured",
      "not_anchored",
      "unavailable",
      "not_checked",
      "not_run",
      "provider_error",
      "checking",
    ]) {
      expect(checkTone(status)).to.equal("neutral");
    }
  });

  it("auto-compares only after the shared receipt is loaded", function () {
    const shared = "0xABC";
    expect(shareAutoComparisonKey(shared, undefined, "0xDEF")).to.equal(undefined);
    expect(shareAutoComparisonKey(shared, shared, undefined)).to.equal(undefined);
    expect(shareAutoComparisonKey("0x123", shared, "0xDEF")).to.equal(undefined);
    expect(shareAutoComparisonKey(shared, "0xabc", "0xDEF")).to.equal("0xabc:0xdef");
  });
});
