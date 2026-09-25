import { expect } from "chai";
import {
  checkTone,
  previewDisplayState,
  shareAutoComparisonKey,
  showShareCheckPlaceholders,
} from "../../nextjs/utils/quoteCheckVisual";

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

  it("keeps the first preview fetch distinct from failed and stale results", function () {
    const base = { hasValidAmount: true, hasFetched: false, hasPreview: false, hasError: false, isFresh: false };
    expect(previewDisplayState(base)).to.equal("loading");
    expect(previewDisplayState({ ...base, hasFetched: true, hasError: true })).to.equal("unavailable");
    expect(previewDisplayState({ ...base, hasFetched: true })).to.equal("unavailable");
    expect(previewDisplayState({ ...base, hasFetched: true, hasPreview: true })).to.equal("stale");
    expect(previewDisplayState({ ...base, hasFetched: true, hasPreview: true, isFresh: true })).to.equal("ready");
    expect(previewDisplayState({ ...base, hasValidAmount: false, hasFetched: true })).to.equal("invalid_amount");
  });

  it("shows shared-check placeholders until all results settle", function () {
    const base = { isShared: true, isComparing: false, hasResults: false, hasError: false, isReverted: false };
    expect(showShareCheckPlaceholders(base)).to.equal(true);
    expect(showShareCheckPlaceholders({ ...base, hasResults: true, isComparing: true })).to.equal(true);
    expect(showShareCheckPlaceholders({ ...base, hasResults: true })).to.equal(false);
    expect(showShareCheckPlaceholders({ ...base, hasError: true })).to.equal(false);
    expect(showShareCheckPlaceholders({ ...base, isReverted: true })).to.equal(false);
    expect(showShareCheckPlaceholders({ ...base, isShared: false })).to.equal(false);
  });
});
