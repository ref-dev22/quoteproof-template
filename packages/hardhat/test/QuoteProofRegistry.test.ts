import { expect } from "chai";
import { ethers } from "hardhat";

const MAX_AGE = 93_600n;
const DECIMALS = 8;
const PRICE_10_CENTS = 10_000_000n;
const PRICE_3_CENTS = 3_000_000n;

function referenceTinybars(cents: bigint, price: bigint, decimals: number): bigint {
  const scaledDollarsPerHbar = price;
  const centsToUsdScale = 10n ** BigInt(decimals + 6);
  const numerator = cents * centsToUsdScale;
  const wholeTinybars = numerator / scaledDollarsPerHbar;
  return numerator % scaledDollarsPerHbar === 0n ? wholeTinybars : wholeTinybars + 1n;
}

describe("QuoteProofRegistry", function () {
  async function deployFixture() {
    const [issuer, secondIssuer] = await ethers.getSigners();
    const Mock = await ethers.getContractFactory("MockQuoteProofAggregator");
    const mock = await Mock.deploy(DECIMALS, "HBAR / USD");
    await mock.waitForDeployment();
    const latestBlock = await ethers.provider.getBlock("latest");
    const now = BigInt(latestBlock?.timestamp ?? Math.floor(Date.now() / 1000));
    await mock.setRoundData(7, PRICE_10_CENTS, now - 120n, now - 100n);

    const Registry = await ethers.getContractFactory("QuoteProofRegistry");
    const registry = await Registry.deploy(mock.target, DECIMALS, MAX_AGE);
    await registry.waitForDeployment();
    return { issuer, secondIssuer, mock, registry, now };
  }

  it("matches the independently derived rounding vectors", async function () {
    const { registry } = await deployFixture();
    const oneDollar = await registry.previewQuote(100);
    expect(oneDollar.tinybars).to.equal(referenceTinybars(100n, PRICE_10_CENTS, DECIMALS));
    expect(oneDollar.tinybars).to.equal(1_000_000_000n);

    const { mock: otherMock } = await deployFixture();
    const latestBlock = await ethers.provider.getBlock("latest");
    const now = BigInt(latestBlock?.timestamp ?? Math.floor(Date.now() / 1000));
    await otherMock.setRoundData(8, PRICE_3_CENTS, now - 10n, now - 5n);
    const Registry = await ethers.getContractFactory("QuoteProofRegistry");
    const otherRegistry = await Registry.deploy(otherMock.target, DECIMALS, MAX_AGE);
    await otherRegistry.waitForDeployment();
    const oneCent = await otherRegistry.previewQuote(1);
    expect(oneCent.tinybars).to.equal(referenceTinybars(1n, PRICE_3_CENTS, DECIMALS));
    expect(oneCent.tinybars).to.equal(33_333_334n);
  });

  it("records a domain-bound receipt and advances only the issuer nonce", async function () {
    const { issuer, secondIssuer, registry } = await deployFixture();
    const preview = await registry.previewQuote(100);
    await expect(registry.createQuote(100, preview.roundId, preview.nonce)).to.emit(registry, "QuoteRecorded");
    const commitment = await registry.getCommitment(issuer.address, 0);
    expect(commitment).to.not.equal(ethers.ZeroHash);
    expect(await registry.nonces(issuer.address)).to.equal(1n);
    expect(await registry.nonces(secondIssuer.address)).to.equal(0n);
    expect(await registry.isStoredCommitment(issuer.address, 0, commitment)).to.equal(true);
  });

  it("rejects invalid provider observations and exact boundary violations", async function () {
    const { mock, registry, now } = await deployFixture();

    await mock.setRoundData(0, PRICE_10_CENTS, now - 1n, now - 1n);
    await expect(registry.previewQuote(100)).to.be.revertedWithCustomError(registry, "InvalidRound");

    await mock.setRoundData(7, 0, now - 1n, now - 1n);
    await expect(registry.previewQuote(100)).to.be.revertedWithCustomError(registry, "InvalidAnswer");

    await mock.setRoundData(7, -1, now - 1n, now - 1n);
    await expect(registry.previewQuote(100)).to.be.revertedWithCustomError(registry, "InvalidAnswer");

    await mock.setRoundData(7, PRICE_10_CENTS, now - 1n, 0);
    await expect(registry.previewQuote(100)).to.be.revertedWithCustomError(registry, "InvalidObservationTime");

    await mock.setRoundData(7, PRICE_10_CENTS, now + 1_000n, now + 1_000n);
    await expect(registry.previewQuote(100)).to.be.revertedWithCustomError(registry, "FutureObservation");

    await mock.setRoundData(7, PRICE_10_CENTS, now - MAX_AGE - 1n, now - MAX_AGE - 1n);
    await expect(registry.previewQuote(100)).to.be.revertedWithCustomError(registry, "StaleObservation");
  });

  it("rejects changed rounds, changed decimals and duplicate nonces", async function () {
    const { issuer, mock, registry, now } = await deployFixture();
    await expect(registry.previewQuote(0)).to.be.revertedWithCustomError(registry, "InvalidCents");
    await expect(registry.previewQuote(100_000_001)).to.be.revertedWithCustomError(registry, "InvalidCents");

    const preview = await registry.previewQuote(100);
    await mock.setRoundData(8, PRICE_10_CENTS, now - 1n, now - 1n);
    await expect(registry.createQuote(100, preview.roundId, preview.nonce)).to.be.revertedWithCustomError(
      registry,
      "PreviewRoundChanged",
    );

    await mock.setRoundData(8, PRICE_10_CENTS, now - 1n, now - 1n);
    await registry.createQuote(100, 8, 0);
    await expect(registry.createQuote(100, 8, 0)).to.be.revertedWithCustomError(registry, "PreviewNonceChanged");

    await mock.setDecimals(9);
    await expect(registry.connect(issuer).previewQuote(100)).to.be.revertedWithCustomError(
      registry,
      "UnexpectedDecimals",
    );
  });

  it("turns an oracle revert into a failed preview", async function () {
    const { mock, registry } = await deployFixture();
    await mock.setRevertLatest(true);
    await expect(registry.previewQuote(100)).to.be.revertedWithCustomError(registry, "OracleReadFailed");
  });
});
