# QuoteProof 99-second recorded demo

The prepared recording is a silent, captioned browser-page capture from the isolated [public judge preview](https://quoteproof-judge-preview.vercel.app/) at implementation `f253f1a`. It shows the current app and a clearly labeled historical CLI evidence report. No wallet connection, signing or new transaction occurs. The original production app remains a separate older deployment.

## What the recording shows

1. **0–8s — Open the current candidate.** The isolated preview opens the historical share route for the existing testnet receipt:
   `https://quoteproof-judge-preview.vercel.app/?tx=0x076690438e81f96fc77f3f6467157d2f53c05703ef098790a42b82909a340ef9`.

2. **8–16s — Show the preview.** The wallet-free preview visibly displays the configured chain context, price, observation age, round and ceiling-to-tinybar quantity. This is a reference quote, not a payment, and preview does not write.

3. **16–36s — Resolve and compare the receipt.** The read-only comparison shows `Locally consistent`, `Historical observation matches`, and `Stored commitment matches` for the genuine historical receipt. The oracle card is an exact-round read, not a comparison with today's latest price.

4. **36–48s — Export the receipt.** The actual `Export receipt JSON` action downloads the receipt. The downloaded JSON was semantically equal to the public historical fixture.

5. **48–99s — Open the recorded standalone report.** The unchanged report presents four earlier measured CLI cases: genuine `valid/match/match`; one-tinybar tamper `invalid/not_checked/not_run`; recomputed amount `valid/match/mismatch`; and recomputed false price `valid/mismatch/mismatch`. The report is explicitly labeled historical standalone evidence, not a live QuoteProof UI result.

The recording is available through the static viewer at `/demo/index.html` on the isolated judge preview. The sanitized fixtures and result matrix are in [`docs/adversarial-evidence.md`](docs/adversarial-evidence.md). The encoded video is 99.44 seconds at 1280×900/25fps and is under the organizer's five-minute limit.

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
