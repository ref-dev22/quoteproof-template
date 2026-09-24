# QuoteProof — reference-quote receipts on Hedera

[![CI](https://github.com/ref-dev22/quoteproof-template/actions/workflows/lint.yaml/badge.svg?branch=main)](https://github.com/ref-dev22/quoteproof-template/actions/workflows/lint.yaml)
[![External scaffold gate](https://github.com/ref-dev22/quoteproof-template/actions/workflows/external-scaffold-release.yml/badge.svg)](https://github.com/ref-dev22/quoteproof-template/actions/workflows/external-scaffold-release.yml)

A shop quotes $1.00 in USD, records the corresponding HBAR reference on Hedera Testnet, and gives anyone a receipt to verify the exact Chainlink oracle round used. This Scaffold-HBAR template is for Hedera developers building auditable reference quotes before a wallet write.

It does more than read a price feed: anyone can verify a receipt later down to the exact oracle round, without a wallet, key, Docker or database. Optional HCS anchoring happens only after the receipt's on-chain event is confirmed; anyone can read the anchor back and verify it without trusting the server.

## How it works

1. Preview a bounded USD-to-HBAR reference from the configured Chainlink feed.
2. Record an event-bound receipt with a connected Testnet wallet.
3. Verify the receipt later against its arithmetic, historical oracle round and stored registry commitment.

## What you'll learn

- Oracle provenance: record which Chainlink round a price came from so anyone can check that observation later, rather than relying on the latest price.
- On-chain fingerprints: hash the quote fields into a commitment stored on Hedera, emit those fields in `QuoteRecorded`, and recompute the hash to check them.
- A public audit trail with HCS: optionally anchor a receipt to a topic protected by a server-held submit key; anyone can read the message from the Mirror Node without a key.
- Verification you can test: adversarial cases show why a well-formed JSON file is not proof on its own.

## Start here

Prerequisites: Node.js `>=20.18.3`, npm, and Git with `user.name` and `user.email` configured. Previewing and running deterministic tests need no wallet, faucet funds, private key, or paid API.

From an empty parent directory, scaffold the template:

```bash
npm create scaffold-hbar@latest -- --template ref-dev22/quoteproof-template
```

The CLI asks for a project name (enter `quoteproof`), whether to install Hedera Skills (choose No for this walkthrough), and the Hedera network (choose Testnet). It then installs dependencies with npm automatically. The `--` forwards `--template` to the creator; without it, npm treats the repository as a positional argument and opens the generic starter menu.

Then start the wallet-free preview:

```bash
cd quoteproof
npm run next:dev -- --hostname 0.0.0.0 --port 3001
```

The flags select port 3001 and listen on all interfaces.

For a non-interactive alternative, use the flagged creator command and install from the committed lockfile:

```bash
npx create-scaffold-hbar@latest quoteproof --template ref-dev22/quoteproof-template --frontend nextjs-app --solidity-framework hardhat --network testnet --package-manager "npm" --ci --skip-hedera-skills --skip-install
cd quoteproof
npm ci
npm run next:dev -- --hostname 0.0.0.0 --port 3001
```

Open `http://localhost:3001`. Check the reference card for a price, round, observation age and quantity; `Reference unavailable` means the live Testnet read did not succeed.

For a direct read-only check while the app is running:

```bash
curl -i "http://localhost:3001/api/quote/preview?cents=100"
```

Expect HTTP `200` with decimal-string `nonce`, `roundId`, `price`, `decimals`, `observedAt` and `tinybars` fields. HTTP `400` means invalid cents; `502` means the reference RPC is unavailable. This endpoint reads a live source, so it is wallet-free but not an offline test.

## Inspect the historical receipt

Open the [public Testnet receipt](examples/receipt-testnet.json) or the local [share route](http://localhost:3001/?tx=0x076690438e81f96fc77f3f6467157d2f53c05703ef098790a42b82909a340ef9&hcsTopic=0.0.10698279&hcsSeq=1). The linked [transaction](https://hashscan.io/testnet/tx/0x076690438e81f96fc77f3f6467157d2f53c05703ef098790a42b82909a340ef9) is historical evidence; this walkthrough does not create another one. In the app, **Compare stored commitment** reports local consistency, the oracle's exact historical round, the stored registry commitment, and the optional HCS anchor separately. The share link carries the HCS topic and sequence outside the receipt JSON; the historical HCS check uses pinned public IDs and needs no environment settings.

Open the historical share link above and select **Compare stored commitment**. The fourth card should show **HCS anchor matches** when the Mirror Node is available. For your own topic, set its public `HCS_TOPIC_ID` and your operator's public `HCS_OPERATOR_ID` in `packages/nextjs/.env.local`, then restart the dev server. These IDs enable read-only verification; no HCS operator key or anchor token is needed for this check.

Exported JSON can be checked without the browser:

```bash
npm run verify:quote -w @sh/hardhat -- --input ../../examples/receipt-testnet.json --expected-chain-id 296 --expected-registry 0xa1a741aF6e0A45164e2Af6A1C35dC30275629709 --expected-oracle 0x59bC155EB6c6C415fE43255aF66EcF0523c92B4a --compare-stored --rpc-url https://testnet.hashio.io/api
```

That command runs from the repository root; its workspace resolves `../../examples/receipt-testnet.json` from `packages/hardhat`. It should report local `valid`, historical-oracle `match`, and stored-record `match` when the public RPC is available. The [four-case adversarial matrix](docs/adversarial-evidence.md) shows why locally consistent JSON is not by itself on-chain proof.

## Develop and test

Use the committed npm lockfile. From the repository root:

```bash
npm ci
npm run hardhat:test
npm run hardhat:compile
npm run hardhat:check-types
npm run hardhat:lint
npm run next:check-types
npm run next:lint
npm run next:build
```

The mock-only [policy workshop](docs/local-policy-workshop.md) provides a deterministic change exercise without credentials:

```bash
node scripts/check-local-policy-workshop.mjs
```

The frontend's preview route reads the configured Testnet registry and Chainlink proxy without a wallet-originating `from` address. A wallet write calls `createQuote(cents, expectedRound, expectedNonce)`; the contract rechecks the observation and nonce before emitting `QuoteRecorded`. The receipt binds the chain, registry, issuer, nonce, oracle observation, calculated tinybars and commitment. The standalone verifier recomputes the receipt locally. The read-only comparison route checks the exact historical oracle round and the stored issuer/nonce record. It never signs or submits a transaction.

The published reference context is Hedera Testnet chain `296`, QuoteProofRegistry `0xa1a741aF6e0A45164e2Af6A1C35dC30275629709`, and Chainlink proxy `0x59bC155EB6c6C415fE43255aF66EcF0523c92B4a`. `observedAt` is the oracle's update time; `recordedAt` is the EVM block timestamp. Neither is the per-transaction Hedera consensus timestamp. This is a reference quote, not a payment, balance guarantee, or current market-price guarantee.

For a receipt selected by an independent source, pass its expected commitment, issuer and nonce together. Do not derive those expected values from the receipt being tested. The complete schema, failure cases and read-only comparison behavior are in [adversarial evidence](docs/adversarial-evidence.md) and the [verifier source](packages/hardhat/utils/quoteReceipt.ts).

## Optional Testnet write

A new deployment and quote recording require a Hedera-created ECDSA Testnet account, faucet funds and local encrypted deployer setup. These are separate from the preview. From the repository root, choose one local account setup command:

```bash
npm run hardhat:account:generate
# or
npm run hardhat:account:import
```

Fund that Testnet account through the [Hedera Portal faucet](https://portal.hedera.com/faucet), review the target network, then run:

```bash
npm run hardhat:deploy -- --network hederaTestnet --tags QuoteProof
npm run quote:e2e -w @sh/hardhat -- --network hederaTestnet --cents 100 --output ./quoteproof-receipt.json
npm run verify:quote -w @sh/hardhat -- --input ./quoteproof-receipt.json
```

The two workspace commands resolve the receipt path as `packages/hardhat/quoteproof-receipt.json`. Deployment regenerates `packages/nextjs/contracts/deployedContracts.ts`; restart Next.js before using the new registry. The committed historical receipt belongs to the published reference registry and does not prove a new deployment. Keep local account material in ignored environment files, never in source or browser fields. [Hosting guidance](docs/hosting.md) covers a read-only deployment.

## Make it yours

1. **Use a different compatible price feed.** Keep the proxy address, expected decimals and description in `packages/hardhat/deploy/03_deploy_quoteproof_registry.ts` aligned with `FEED_ID` and `EXPECTED_DESCRIPTION_HASH` in `packages/hardhat/contracts/QuoteProofRegistry.sol`, `FEED_ID` and its validation in `packages/hardhat/utils/quoteReceipt.ts`, and `QUOTE_PROOF_ORACLE_ADDRESS` in `packages/nextjs/contracts/quoteProofContext.ts`. If the pair changes from HBAR/USD, also adapt the USD-to-HBAR arithmetic and HBAR/USD labels; redeploy to regenerate `packages/nextjs/contracts/deployedContracts.ts` and restart the app. Run `npm run hardhat:test`: the constructor-guard tests in `QuoteProofRegistry.test.ts` and bound-field checks in `quoteReceipt.test.ts` catch feed-policy mismatches.
2. **Add a receipt field, such as an order ID.** Search for `QuoteData`, `SCHEMA_VERSION`, `RECEIPT_FIELDS`, `RECEIPT_TUPLE`, `quoteRecordedAbi` and `matchesQuoteRecordedLog`; keep the Solidity struct and commitment, TypeScript parser and encoder, UI and HCS event decoders, and both JSON exporters (`packages/hardhat/scripts/createQuoteProof.ts` and `serializeReceipt` in `packages/nextjs/components/QuoteProofExperience.tsx`) in sync. Update fixtures and run `npm run hardhat:test`: the event round-trip in `QuoteProofRegistry.test.ts`, ABI-tuple test in `quoteReceipt.test.ts` and log-match test in `quoteHcsAnchorRoute.test.ts` catch schema drift.
3. **Anchor to your own HCS topic.** Put `HCS_OPERATOR_ID` and a `0x`-prefixed ECDSA `HCS_OPERATOR_KEY` for a funded Testnet account in the ignored `packages/nextjs/.env.local`, then run `node --env-file=packages/nextjs/.env.local packages/nextjs/scripts/createHcsTopic.cjs` from the repository root to create a topic with that account's submit key. Set `HCS_TOPIC_ID` and `HCS_ANCHOR_TOKEN` in the same server environment, keeping the key and token private; without HCS configuration, the app boots with anchoring off. Run `npm run hardhat:test`: `quoteHcsAnchorRoute.test.ts` checks the operator and topic submit key, while `quoteHcsVerifyRoute.test.ts` rejects a foreign payer.

## Limits

QuoteProof does not transfer HBAR or prove payment.

Anchoring the same receipt twice creates two HCS messages. The verifier's trust anchor is the configured server account recorded as each message's payer; it checks that payer when reading the message back.

## Security notes

- `npm audit --omit=dev` reports high-severity advisories in dependencies used by the Scaffold-HBAR starter and the optional Hiero SDK integration. The installed SDK matches the latest npm release checked; npm also suggests a Next.js major upgrade, an older Hedera proto package, and a different burner-wallet version. Those proposed changes have not been validated with this template, so they were not applied.
- QuoteProof loads the Hiero SDK for optional HCS anchoring and its operator-key checks. The anchor route requires a bearer token, validates the receipt and its on-chain event, and submits an anchor with a fixed set of fields. The audit does not establish exploitability through QuoteProof's routes. See the [dated audit](docs/security.md) for the findings and exact versions.
- Run `npm audit --omit=dev` yourself and review the advisories before any production use.

## Repository and notices

- `packages/hardhat/contracts/QuoteProofRegistry.sol`: registry, policy and event.
- `packages/hardhat/scripts/verifyQuote.ts`: standalone receipt verifier.
- `packages/nextjs/components/QuoteProofExperience.tsx`: preview, guarded wallet write, share/export and comparison UI.
- `packages/nextjs/app/api/quote/preview/route.ts` and `compare/route.ts`: read-only API paths.
- `docs/release-evidence.md`: revision-specific historical checks and hosted-preview provenance.
- `LICENCE`: MIT license and upstream notice.

AI-assisted implementation and review were used. Developers can reproduce the checks above and should inspect the code and dependency advisories before adapting this template.
