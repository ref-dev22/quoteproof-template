# Your first verifiable receipt in 15 minutes

This walkthrough uses a published Hedera Testnet receipt. You need Node.js `>=20.18.3`, npm, and Git with `user.name` and `user.email` set. You do not need a wallet or Testnet funds.

## 1. Scaffold and start

From an empty parent directory, run the same command as [Start here](../README.md#start-here):

```bash tutorial:scaffold
npm create scaffold-hbar@latest -- quoteproof --template ref-dev22/quoteproof-template --frontend nextjs-app --solidity-framework hardhat --network testnet --package-manager npm --skip-hedera-skills
```

You should see a `quoteproof` directory with installed dependencies and `packages/hardhat/contracts/QuoteProofRegistry.sol`. If Git identity is missing, set `git config --global user.name` and `git config --global user.email`, then retry in an empty parent directory. If the GitHub template lookup is rate-limited, keep every flag above; they pin Hardhat and npm even when the manifest cannot be read.

```bash tutorial:start
cd quoteproof
npm run next:dev -- --hostname 0.0.0.0 --port 3001
```

Open `http://localhost:3001`. You should see the reference card; the first price fetch may show **Loading reference…**. If port 3001 is in use, stop the other server or change the port in the command and links below. If the feed is stale or the RPC is down, **Reference unavailable or stale** can appear; the historical receipt checks below use an older, fixed observation.

## 2. Read and challenge the receipt

Open the [historical share link on your app](http://localhost:3001/?tx=0x076690438e81f96fc77f3f6467157d2f53c05703ef098790a42b82909a340ef9&hcsTopic=0.0.10698279&hcsSeq=1). The page loads the published receipt and runs four checks: local arithmetic, stored registry fingerprint, historical Chainlink round, and HCS anchor. You should see four green matches. If an RPC or Mirror Node is unavailable, a network check can be gray; retry later without recording another transaction.

Scroll to **Try to forge this receipt**. Tap **Add 1 tinybar**: arithmetic turns red, while the other three checks are skipped. Tap **Change $1.00 to $10.00 and recompute the fingerprint**: arithmetic and the real oracle price pass, but the registry and HCS checks turn red. Tap **Double the oracle price and recompute the fingerprint**: only arithmetic passes. **Restore original** returns to four green checks. These buttons change prepared copies in your browser; they do not write to Hedera. If the buttons are absent, open the historical share link above; the simulation is offered only for that receipt.

## 3. Run the same cases in a terminal

From the `quoteproof` directory, run:

```bash tutorial:demo
npm run demo
```

You should see a table with the genuine receipt passing and three altered cases caught, plus the arithmetic, issued-quote and on-chain layers. The local checks run offline. If the RPC is unavailable, network columns say `skipped (offline)`; that is not a forged-receipt failure. Compare the results with [What each check catches](../README.md#what-each-check-catches).

## 4. Verify exported JSON

The repo includes the [published receipt JSON](../examples/receipt-testnet.json). From `quoteproof`, run the [same verifier command as the README](../README.md#inspect-the-historical-receipt):

```bash tutorial:verify
npm run verify:quote -w @sh/hardhat -- --input ../../examples/receipt-testnet.json --expected-chain-id 296 --expected-registry 0xa1a741aF6e0A45164e2Af6A1C35dC30275629709 --expected-oracle 0x59bC155EB6c6C415fE43255aF66EcF0523c92B4a --compare-stored --rpc-url https://testnet.hashio.io/api
```

You should see local `valid`, historical oracle `match`, and stored record `match`. If the public RPC is unavailable, keep the local result and rerun the network comparison later. If you verify your own receipt, supply the registry, oracle, chain and expected quote from an independent source, not the JSON being tested.

## 5. Find the pattern

- [Registry contract](../packages/hardhat/contracts/QuoteProofRegistry.sol): bounds the price observation and stores a commitment.
- [Receipt parser and fingerprint](../packages/hardhat/utils/quoteReceipt.ts): checks fields and recomputes the hash.
- [Preview route](../packages/nextjs/app/api/quote/preview/route.ts): reads the live reference without a wallet.
- [Compare route](../packages/nextjs/app/api/quote/compare/route.ts): reads the recorded commitment and exact oracle round.
- [HCS verify route](../packages/nextjs/app/api/quote/hcs/verify/route.ts): checks a public topic message.
- [Forge controls](../packages/nextjs/components/quoteproof/ForgePanel.tsx) and [four prepared fixtures](../examples/adversarial/): run the browser challenge.
- [Tamper demo](../scripts/demo.mjs): runs the terminal challenge.

For a different feed or receipt field, follow [Make it yours](../README.md#make-it-yours). A new receipt requires the owner-authorized steps in [Optional Testnet write](../README.md#optional-testnet-write); this wallet-free tutorial does not run them.
