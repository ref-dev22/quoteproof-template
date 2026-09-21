import { expect } from "chai";
import { ethers } from "hardhat";
import {
  FEED_ID,
  MAX_CENTS,
  REFERENCE_MAX_AGE,
  SCHEMA_VERSION,
  computeReceiptCommitment,
  verifyReceiptObject,
  type QuoteReceiptJson,
} from "../utils/quoteReceipt";

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
    expect(await registry.isStoredCommitment(issuer.address, 1, commitment)).to.equal(false);
    expect(await registry.isStoredCommitment(issuer.address, 0, ethers.ZeroHash)).to.equal(false);
    expect(await registry.isStoredCommitment(secondIssuer.address, 0, commitment)).to.equal(false);

    const secondPreview = await registry.connect(secondIssuer).previewQuote(100);
    await registry.connect(secondIssuer).createQuote(100, secondPreview.roundId, secondPreview.nonce);
    const secondCommitment = await registry.getCommitment(secondIssuer.address, 0);
    expect(secondCommitment).to.not.equal(commitment);
    expect(await registry.nonces(secondIssuer.address)).to.equal(1n);
    expect(await registry.isStoredCommitment(secondIssuer.address, 0, secondCommitment)).to.equal(true);
  });

  it("round-trips the Solidity event through the standalone verifier", async function () {
    const { issuer, mock, registry } = await deployFixture();
    expect(await registry.FEED_ID()).to.equal(FEED_ID);
    expect(await registry.SCHEMA_VERSION()).to.equal(SCHEMA_VERSION);
    expect(await registry.MAX_CENTS()).to.equal(MAX_CENTS);
    expect(await registry.maxAge()).to.equal(REFERENCE_MAX_AGE);

    const preview = await registry.previewQuote(100);
    const transaction = await registry.createQuote(100, preview.roundId, preview.nonce);
    const confirmed = await transaction.wait();
    if (!confirmed) throw new Error("test transaction did not confirm");

    const quoteEvent = confirmed.logs
      .map(log => {
        if (log.address.toLowerCase() !== String(registry.target).toLowerCase()) return null;
        try {
          return registry.interface.parseLog({ topics: [...log.topics], data: log.data });
        } catch {
          return null;
        }
      })
      .find(event => event?.name === "QuoteRecorded");
    if (!quoteEvent) throw new Error("QuoteRecorded event missing from test transaction");

    const eventCommitment = String(quoteEvent.args[0]);
    const quote = quoteEvent.args[1];
    const receipt: QuoteReceiptJson = {
      schemaVersion: quote.schemaVersion.toString(),
      chainId: quote.chainId.toString(),
      registry: quote.registry,
      issuer: quote.issuer,
      nonce: quote.nonce.toString(),
      cents: quote.cents.toString(),
      oracle: quote.oracle,
      feedId: quote.feedId,
      roundId: quote.roundId.toString(),
      price: quote.price.toString(),
      decimals: quote.decimals.toString(),
      observedAt: quote.observedAt.toString(),
      recordedAt: quote.recordedAt.toString(),
      maximumAge: quote.maximumAge.toString(),
      tinybars: quote.tinybars.toString(),
      commitment: eventCommitment,
    };

    expect(computeReceiptCommitment(receipt)).to.equal(eventCommitment);
    expect(await registry.getCommitment(issuer.address, quote.nonce)).to.equal(eventCommitment);
    expect(await registry.isStoredCommitment(issuer.address, quote.nonce, eventCommitment)).to.equal(true);
    const verification = verifyReceiptObject(receipt, {
      expectedChainId: 31337n,
      expectedRegistry: String(registry.target),
      expectedOracle: String(mock.target),
      expectedIssuer: issuer.address,
    });
    expect(verification.valid).to.equal(true);
    expect(verification.onChainVerified).to.equal(false);
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

  it("enforces constructor oracle and policy guards", async function () {
    const Mock = await ethers.getContractFactory("MockQuoteProofAggregator");
    const mock = await Mock.deploy(DECIMALS, "HBAR / USD");
    await mock.waitForDeployment();
    const Registry = await ethers.getContractFactory("QuoteProofRegistry");
    const [issuer] = await ethers.getSigners();

    await expect(Registry.deploy(ethers.ZeroAddress, DECIMALS, MAX_AGE)).to.be.revertedWithCustomError(
      Registry,
      "InvalidOracle",
    );
    await expect(Registry.deploy(issuer.address, DECIMALS, MAX_AGE)).to.be.revertedWithCustomError(
      Registry,
      "InvalidOracle",
    );
    await expect(Registry.deploy(mock.target, 19, MAX_AGE)).to.be.revertedWithCustomError(Registry, "InvalidOracle");
    await expect(Registry.deploy(mock.target, DECIMALS, 0)).to.be.revertedWithCustomError(Registry, "InvalidMaxAge");

    const wrongDescription = await Mock.deploy(DECIMALS, "HBAR/USD");
    await wrongDescription.waitForDeployment();
    await expect(Registry.deploy(wrongDescription.target, DECIMALS, MAX_AGE)).to.be.revertedWithCustomError(
      Registry,
      "InvalidFeedDescription",
    );
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

  it("covers exact age, scale extremes, monotonicity and rounding bounds", async function () {
    const { mock, registry } = await deployFixture();
    const latestBlock = await ethers.provider.getBlock("latest");
    const nextPreviewTimestamp = BigInt(latestBlock?.timestamp ?? Math.floor(Date.now() / 1000)) + 2n;
    await mock.setRoundData(9, PRICE_10_CENTS, nextPreviewTimestamp - MAX_AGE, nextPreviewTimestamp - MAX_AGE);
    await ethers.provider.send("evm_setNextBlockTimestamp", [Number(nextPreviewTimestamp)]);
    const exactBoundary = await registry.previewQuote(1);
    expect(exactBoundary.observedAt).to.equal(nextPreviewTimestamp - MAX_AGE);
    expect(exactBoundary.tinybars).to.be.greaterThan(0n);

    await mock.setRoundData(10, 1, nextPreviewTimestamp - 1n, nextPreviewTimestamp - 1n);
    const lowPrice = await registry.previewQuote(1);
    expect(lowPrice.tinybars).to.equal(100_000_000_000_000n);
    await mock.setRoundData(11, 100_000_000_000_000_000n, nextPreviewTimestamp - 1n, nextPreviewTimestamp - 1n);
    const highPrice = await registry.previewQuote(1);
    expect(highPrice.tinybars).to.equal(1n);

    await mock.setRoundData(12, PRICE_10_CENTS, nextPreviewTimestamp - 1n, nextPreviewTimestamp - 1n);
    const minimum = await registry.previewQuote(1);
    const maximum = await registry.previewQuote(100_000_000);
    expect(maximum.tinybars).to.be.greaterThan(minimum.tinybars);
    const numerator = 100_000_000n * 10n ** 14n;
    expect(maximum.tinybars * PRICE_10_CENTS).to.be.greaterThanOrEqual(numerator);
    expect((maximum.tinybars - 1n) * PRICE_10_CENTS).to.be.lessThan(numerator);

    await mock.setRoundData(13, 20_000_000, nextPreviewTimestamp - 1n, nextPreviewTimestamp - 1n);
    const doubledPrice = await registry.previewQuote(100);
    await mock.setRoundData(14, PRICE_10_CENTS, nextPreviewTimestamp - 1n, nextPreviewTimestamp - 1n);
    const basePrice = await registry.previewQuote(100);
    expect(doubledPrice.tinybars).to.be.lessThan(basePrice.tinybars);
  });

  it("gives the same quote across decimal scales", async function () {
    const Mock = await ethers.getContractFactory("MockQuoteProofAggregator");
    const zeroDecimalMock = await Mock.deploy(0, "HBAR / USD");
    await zeroDecimalMock.waitForDeployment();
    const eighteenDecimalMock = await Mock.deploy(18, "HBAR / USD");
    await eighteenDecimalMock.waitForDeployment();
    const latestBlock = await ethers.provider.getBlock("latest");
    const current = BigInt(latestBlock?.timestamp ?? Math.floor(Date.now() / 1000));
    await zeroDecimalMock.setRoundData(1, 1, current - 1n, current - 1n);
    await eighteenDecimalMock.setRoundData(1, 1_000_000_000_000_000_000n, current - 1n, current - 1n);
    const Registry = await ethers.getContractFactory("QuoteProofRegistry");
    const zeroRegistry = await Registry.deploy(zeroDecimalMock.target, 0, MAX_AGE);
    const eighteenRegistry = await Registry.deploy(eighteenDecimalMock.target, 18, MAX_AGE);
    await zeroRegistry.waitForDeployment();
    await eighteenRegistry.waitForDeployment();
    const zeroScaleQuote = await zeroRegistry.previewQuote(100);
    const eighteenScaleQuote = await eighteenRegistry.previewQuote(100);
    expect(zeroScaleQuote.tinybars).to.equal(eighteenScaleQuote.tinybars);
  });
});
