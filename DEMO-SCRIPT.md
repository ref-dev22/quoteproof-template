# QuoteProof 118-second recorded demo

The prepared recording is a silent, captioned browser-page capture. It shows the public app and a clearly labeled recorded CLI evidence report. No wallet action, signing, or new transaction occurs; the Scaffold preview may initialize its known burner automatically, so the claim is about actions taken in the demo.

## What the recording shows

1. **0–13s — Open the public experience.** The historical share route is opened for the existing testnet receipt:
   `https://quoteproof.vercel.app/?tx=0x076690438e81f96fc77f3f6467157d2f53c05703ef098790a42b82909a340ef9`.

2. **13–28s — Show the preview.** The wallet-free preview visibly displays the configured chain context, price, observation age, round and ceiling-to-tinybar quantity. This is a reference quote, not a payment, and preview does not write.

3. **28–41s — Compare the receipt.** The read-only comparison shows `Locally consistent`, `Historical observation matches`, and `Stored commitment matches` for the genuine historical receipt. The oracle card is an exact-round read, not a comparison with today's latest price.

4. **42–56s — Export the receipt.** The actual `Export receipt JSON` action downloads the receipt. The browser result was semantically equal to the public historical fixture.

5. **58–114s — Open the recorded standalone report.** The report presents the four measured CLI cases: genuine `valid/match/match`; one-tinybar tamper `invalid/not_checked/not_run`; recomputed amount `valid/match/mismatch`; and recomputed false price `valid/mismatch/mismatch`. The report is explicitly labeled as recorded standalone evidence, not QuoteProof UI.

The recording is available through the prepared static viewer at `/demo/index.html` after the public asset update. The sanitized fixtures and result matrix are in [`docs/adversarial-evidence.md`](docs/adversarial-evidence.md).

## Reproduce outside the recording

These commands are separate from the video. From the repository root, run the standalone verifier against the public genuine fixture:

```bash
npm run verify:quote -w @sh/hardhat -- --input ../../examples/adversarial/genuine.json --expected-chain-id 296 --expected-registry 0xa1a741aF6e0A45164e2Af6A1C35dC30275629709 --expected-oracle 0x59bC155EB6c6C415fE43255aF66EcF0523c92B4a --compare-stored --rpc-url https://testnet.hashio.io/api
```

For the four public fixtures, follow [`docs/adversarial-evidence.md`](docs/adversarial-evidence.md). Negative cases intentionally exit `2`. The optional deterministic guard test is separate as well:

```bash
npm run hardhat:test -- test/quoteWriteGuards.test.ts
```

The historical transaction is evidence only. Publication, external scaffold execution and contest submission remain separate owner-authorized gates.
