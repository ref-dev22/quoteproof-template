import { expect } from "chai";
import { canWriteQuote, friendlyWriteError, type QuoteWriteGuardState } from "../../nextjs/utils/quoteWrite";

const readyState: QuoteWriteGuardState = {
  hasPreview: true,
  hasCents: true,
  isConnected: true,
  hasNonce: true,
  wrongNetwork: false,
  isMining: false,
  hasTxHash: false,
};

async function attemptWrite(state: QuoteWriteGuardState, write: () => Promise<void>): Promise<void> {
  if (!canWriteQuote(state)) return;
  await write();
}

describe("mocked wallet write guards", function () {
  it("allows exactly one ready write and blocks wrong-network, pending and duplicate states", async function () {
    let calls = 0;
    const write = async () => {
      calls += 1;
    };

    await attemptWrite(readyState, write);
    await attemptWrite({ ...readyState, wrongNetwork: true }, write);
    await attemptWrite({ ...readyState, isMining: true }, write);
    await attemptWrite({ ...readyState, hasTxHash: true }, write);

    expect(calls).to.equal(1);
    expect(canWriteQuote({ ...readyState, wrongNetwork: true })).to.equal(false);
    expect(canWriteQuote({ ...readyState, isMining: true })).to.equal(false);
    expect(canWriteQuote({ ...readyState, hasTxHash: true })).to.equal(false);
  });

  it("maps a mocked signature rejection without retrying", async function () {
    let calls = 0;
    const write = async () => {
      calls += 1;
      throw new Error("User rejected the request");
    };

    try {
      await attemptWrite(readyState, write);
      expect.fail("the mocked wallet should reject");
    } catch (error) {
      expect(friendlyWriteError(error)).to.equal(
        "Signature rejected. Nothing was recorded; review the quote and try again when you are ready.",
      );
    }

    expect(calls).to.equal(1);
  });
});
