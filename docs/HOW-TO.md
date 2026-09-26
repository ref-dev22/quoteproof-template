# How-to

For the wallet-free first run, use the [tutorial](TUTORIAL.md). Commands here run from the repository root unless a step says otherwise.

## Inspect the historical receipt

See tampering caught in 30 seconds: `npm run demo`.

Open the [public Testnet receipt](../examples/receipt-testnet.json) or the local [share route](http://localhost:3001/?tx=0x076690438e81f96fc77f3f6467157d2f53c05703ef098790a42b82909a340ef9&hcsTopic=0.0.10698279&hcsSeq=1). The linked [transaction](https://hashscan.io/testnet/tx/0x076690438e81f96fc77f3f6467157d2f53c05703ef098790a42b82909a340ef9) is historical evidence; this walkthrough does not create another one. In the app, **Compare stored commitment** reports local consistency, the oracle's exact historical round, the stored registry commitment, and the optional HCS anchor separately. The share link carries the HCS topic and sequence outside the receipt JSON; the historical HCS check uses pinned public IDs and needs no environment settings.

Open the historical share link above; its four read-only checks run automatically. Select **Compare stored commitment** to rerun them. The fourth card should show **HCS anchor matches** when the Mirror Node is available. For your own topic, set its public `HCS_TOPIC_ID` and your operator's public `HCS_OPERATOR_ID` in `packages/nextjs/.env.local`, then restart the dev server. These IDs enable read-only verification; no HCS operator key or anchor token is needed for this check.

Exported JSON can be checked without the browser:

```bash
npm run verify:quote -w @sh/hardhat -- --input ../../examples/receipt-testnet.json --expected-chain-id 296 --expected-registry 0xa1a741aF6e0A45164e2Af6A1C35dC30275629709 --expected-oracle 0x59bC155EB6c6C415fE43255aF66EcF0523c92B4a --compare-stored --rpc-url https://testnet.hashio.io/api
```

That command runs from the repository root; its workspace resolves `../../examples/receipt-testnet.json` from `packages/hardhat`. It should report local `valid`, historical-oracle `match`, and stored-record `match` when the public RPC is available. The [four-case adversarial matrix](adversarial-evidence.md) shows why locally consistent JSON is not by itself on-chain proof.

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

The two workspace commands resolve the receipt path as `packages/hardhat/quoteproof-receipt.json`. Deployment regenerates `packages/nextjs/contracts/deployedContracts.ts`; restart Next.js before using the new registry. The committed historical receipt belongs to the published reference registry and does not prove a new deployment. Keep local account material in ignored environment files, never in source or browser fields. [Hosting guidance](hosting.md) covers a read-only deployment.

## Swap the price feed

Keep the proxy address, decimals and description in `packages/hardhat/deploy/03_deploy_quoteproof_registry.ts` aligned with `FEED_ID` and `EXPECTED_DESCRIPTION_HASH` in `packages/hardhat/contracts/QuoteProofRegistry.sol`. Also update `FEED_ID` and its validation in `packages/hardhat/utils/quoteReceipt.ts`, plus `QUOTE_PROOF_ORACLE_ADDRESS` in `packages/nextjs/contracts/quoteProofContext.ts`. If the pair changes from HBAR/USD, adapt the USD-to-HBAR arithmetic and labels; redeploy to regenerate `packages/nextjs/contracts/deployedContracts.ts`, then restart the app. Run `npm run hardhat:test`: constructor guards in `QuoteProofRegistry.test.ts` and bound-field checks in `quoteReceipt.test.ts` catch mismatches.

## Add a receipt field

Search for `QuoteData`, `SCHEMA_VERSION`, `RECEIPT_FIELDS`, `RECEIPT_TUPLE`, `quoteRecordedAbi` and `matchesQuoteRecordedLog`. Keep the Solidity struct and commitment, TypeScript parser and encoder, UI and HCS event decoders, and both JSON exporters in sync: `packages/hardhat/scripts/createQuoteProof.ts` and `serializeReceipt` in `packages/nextjs/components/quoteproof/model.ts`. Update fixtures and run `npm run hardhat:test`. The event round-trip in `QuoteProofRegistry.test.ts`, ABI-tuple test in `quoteReceipt.test.ts` and log-match test in `quoteHcsAnchorRoute.test.ts` catch schema drift.

## Anchor to your own HCS topic

Put `HCS_OPERATOR_ID` and a `0x`-prefixed ECDSA `HCS_OPERATOR_KEY` for a funded Testnet account in ignored `packages/nextjs/.env.local`. Run `node --env-file=packages/nextjs/.env.local packages/nextjs/scripts/createHcsTopic.cjs` from the root to create a topic with that account's submit key. Set `HCS_TOPIC_ID` and `HCS_ANCHOR_TOKEN` in the same server environment; keep the key and token private. Run `npm run hardhat:test`: `quoteHcsAnchorRoute.test.ts` checks the operator and topic submit key, while `quoteHcsVerifyRoute.test.ts` rejects a foreign payer. Without HCS configuration, the app boots with anchoring off.

## Host a read-only preview

Follow [hosting.md](hosting.md). The hosted app can read the published Testnet registry without a server signing key. A build alone does not confirm that live RPC and Mirror Node reads work.

## Run the policy workshop

Follow the [mock-only policy workshop](local-policy-workshop.md) and run `node scripts/check-local-policy-workshop.mjs`. It uses deterministic tests and no credentials.

## Troubleshoot

| Symptom | Cause | Fix |
| --- | --- | --- |
| Scaffold asks for Git identity or stops | Git `user.name` or `user.email` is missing. | Set both with `git config --global`, then retry from an empty parent directory. |
| Scaffold selects Foundry or Yarn | GitHub template lookup was rate-limited and the creator fell back to defaults. | Use every flag in the [Start here command](../README.md#start-here), including the `--` after `@latest`. |
| Port 3001 is in use | Another local server holds the port. | Stop that server or choose a different `--port` and update local links. |
| Reference unavailable or stale | The feed observation exceeded the 93,600-second bound or the reference RPC failed. | Check the [preview route](../packages/nextjs/app/api/quote/preview/route.ts) response; wait for a newer Testnet round or restore RPC access. |
| Recorded or oracle check is gray | JSON-RPC failed or its chain is wrong. | Check the Testnet RPC URL and retry a read. A gray network result is not a forged receipt. |
| HCS check is gray | Mirror Node is unreachable, the message is not indexed, or own-topic IDs are absent. | Check Mirror Node availability and public `HCS_TOPIC_ID`/`HCS_OPERATOR_ID`; retry later. |
| Forge buttons are missing | The loaded receipt is not the published historical one. | Open the [historical share link](../README.md) with its `tx`, `hcsTopic` and `hcsSeq` values. |
