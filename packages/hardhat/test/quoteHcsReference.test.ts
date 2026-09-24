import { expect } from "chai";
import {
  HISTORICAL_HCS_REFERENCE,
  hcsAnchorStatusLabel,
  hcsAnchorViewStatus,
  parseHcsAnchorReference,
  quoteSharePath,
} from "../../nextjs/utils/quoteHcsReference";

const historicalTransaction = "0x076690438e81f96fc77f3f6467157d2f53c05703ef098790a42b82909a340ef9";

describe("HCS share reference", function () {
  it("round-trips the historical topic and sequence outside the receipt JSON", function () {
    const path = quoteSharePath(historicalTransaction, HISTORICAL_HCS_REFERENCE);
    expect(path).to.equal(`/?tx=${historicalTransaction}&hcsTopic=0.0.10698279&hcsSeq=1`);
    expect(parseHcsAnchorReference(new URL(path, "http://localhost").search)).to.deep.equal(HISTORICAL_HCS_REFERENCE);
  });

  it("leaves a plain share link unanchored and rejects partial or unsafe references", function () {
    expect(quoteSharePath(historicalTransaction)).to.equal(`/?tx=${historicalTransaction}`);
    expect(parseHcsAnchorReference(`?tx=${historicalTransaction}`)).to.equal(undefined);
    expect(parseHcsAnchorReference("?hcsTopic=0.0.10698279")).to.equal(undefined);
    expect(parseHcsAnchorReference("?hcsTopic=0.0.10698279&hcsSeq=0")).to.equal(undefined);
    expect(parseHcsAnchorReference("?hcsTopic=0.0.10698279&hcsSeq=9007199254740992")).to.equal(undefined);
    expect(parseHcsAnchorReference("?hcsTopic=not-a-topic&hcsSeq=1")).to.equal(undefined);
  });

  it("uses neutral labels for no anchor reference and missing server configuration", function () {
    expect(hcsAnchorStatusLabel(hcsAnchorViewStatus())).to.equal("Not anchored");
    expect(hcsAnchorStatusLabel(hcsAnchorViewStatus(HISTORICAL_HCS_REFERENCE, "not_configured"))).to.equal(
      "Not configured",
    );
  });
});
