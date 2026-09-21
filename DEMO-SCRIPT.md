# QuoteProof 90-second demo

This is a read-only walkthrough. It does not connect a wallet, unlock an account, sign, or submit a transaction.

1. **0–10s — Open the experience.** Start the app with `npm run next:dev -- --hostname 0.0.0.0 --port 3001`, then open the historical share route:
   `http://localhost:3001/?tx=0x076690438e81f96fc77f3f6467157d2f53c05703ef098790a42b82909a340ef9`.

2. **10–25s — Show provenance and calculation.** Point to the wallet-free preview: Hedera Testnet chain `296`, Chainlink HBAR/USD, price, observation age, round, ceiling-to-tinybar quantity, feed ID and oracle. Say: “This is a reference quote, not a payment, and preview does not write.”

3. **25–40s — Show portable proof.** Point to `Confirmed on Hedera testnet`, the event-bound reference/quantity/round/commitment, and the HashScan/Mirror links. Click `Compare stored commitment`. The three visible results should be `Locally consistent`, `Historical observation matches`, and `Stored commitment matches` for the genuine historical receipt. The oracle card is an exact-round read, not a comparison with today's latest price.

4. **40–52s — Show the offline boundary.** Click `Export receipt JSON`, then stop relying on the web app and run `npm run verify:quote -w @sh/hardhat -- --input <downloaded-file> --expected-chain-id 296 --expected-registry 0xa1a741aF6e0A45164e2Af6A1C35dC30275629709 --expected-oracle 0x59bC155EB6c6C415fE43255aF66EcF0523c92B4a --compare-stored --rpc-url https://testnet.hashio.io/api`. The valid result is calculation-checked and explicitly `onChainVerified: false`; the CLI's separate `historicalOracle` and `recordedComparison` results perform the read-only checks directly. If an independently selected expected quote is available, add its commitment, issuer and nonce flags; otherwise `expectedQuote` remains `not_supplied`.

5. **52–68s — Show adversarial evidence.** In a terminal-only, read-only fixture check, change cents without changing tinybars/commitment: the API returns `invalid` / `not_checked` / `not_run`. Recompute cents, tinybars and commitment consistently: the API returns `valid` / `match` / `mismatch` against the genuine stored record. Recompute a false price instead: the historical oracle check also becomes `mismatch`. These forged-copy cases are API-tested; the UI intentionally has no receipt-import or forgery control.

6. **68–80s — Show recovery states.** Point to the visible stale-feed, changed-round and altered-receipt recovery cards. Explain that missing records, wrong context, wrong provider network and provider failure remain distinct and never trigger a write.

7. **80–90s — Show wallet safety evidence.** Run `npm run hardhat:test -- test/quoteWriteGuards.test.ts`. The deterministic mock harness proves one ready write is allowed, while wrong-network, pending and duplicate states make zero writer calls; a mocked signature rejection is surfaced once with no retry. No real signing is part of this demo.

The real testnet transaction is historical evidence only. Publication, external scaffold execution and contest submission are separate owner-authorized gates.
