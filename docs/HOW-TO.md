# How-to guides

## Inspect the historical receipt

Run `npm run demo` to compare the genuine receipt and prepared forgeries.

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

For documentation changes, run the [link and anchor check](../scripts/ci-check-doc-links.mjs), [guardrail tests](../scripts/doc-checks.test.mjs), and [prose check](../scripts/ci-check-doc-prose.mjs):

```bash
node scripts/ci-check-doc-links.mjs
node --test scripts/doc-checks.test.mjs
node scripts/ci-check-doc-prose.mjs
```

The link check covers the README, AGENTS and every `docs/*.md` file.
External URLs produce warnings; relative targets and anchors must exist.
Use `--local-only` on the link check for an offline run.
The prose check covers the README and `docs/*.md`; it rejects the vocabulary listed in [doc-checks.mjs](../scripts/doc-checks.mjs).
Code examples and URL destinations are excluded from prose checks.
Longest-sentence counts are informational.

### Policy workshop

The mock-only [policy workshop](local-policy-workshop.md) provides a deterministic change exercise without credentials:

```bash
node scripts/check-local-policy-workshop.mjs
```

## Record a new receipt on Testnet

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

Keep these feed-policy locations aligned:

- [Deployment](../packages/hardhat/deploy/03_deploy_quoteproof_registry.ts): proxy address, expected decimals and description.
- [Registry](../packages/hardhat/contracts/QuoteProofRegistry.sol): `FEED_ID` and `EXPECTED_DESCRIPTION_HASH`.
- [Receipt verifier](../packages/hardhat/utils/quoteReceipt.ts): `FEED_ID` and its validation.
- [Frontend context](../packages/nextjs/contracts/quoteProofContext.ts): `QUOTE_PROOF_ORACLE_ADDRESS`.

If the pair changes from HBAR/USD, adapt the USD-to-HBAR arithmetic and HBAR/USD labels too.
Redeploy to regenerate [deployedContracts.ts](../packages/nextjs/contracts/deployedContracts.ts), then restart the app.
Run `npm run hardhat:test`.
Constructor guards in [QuoteProofRegistry.test.ts](../packages/hardhat/test/QuoteProofRegistry.test.ts) and bound-field checks in [quoteReceipt.test.ts](../packages/hardhat/test/quoteReceipt.test.ts) catch feed-policy mismatches.

## Add a receipt field

For a field such as an order ID, search for `QuoteData`, `SCHEMA_VERSION`, `RECEIPT_FIELDS`, `RECEIPT_TUPLE`, `quoteRecordedAbi` and `matchesQuoteRecordedLog`.
Keep these locations in sync:

- [Solidity struct, commitment and event](../packages/hardhat/contracts/QuoteProofRegistry.sol).
- [TypeScript parser and encoder](../packages/hardhat/utils/quoteReceipt.ts).
- [UI event decoder and JSON serializer](../packages/nextjs/components/quoteproof/model.ts).
- [HCS event decoder](../packages/nextjs/utils/quoteHcs.ts).
- [CLI JSON exporter](../packages/hardhat/scripts/createQuoteProof.ts).

Update the fixtures and run `npm run hardhat:test`.
The event round-trip in [QuoteProofRegistry.test.ts](../packages/hardhat/test/QuoteProofRegistry.test.ts), ABI-tuple test in [quoteReceipt.test.ts](../packages/hardhat/test/quoteReceipt.test.ts), and log-match test in [quoteHcsAnchorRoute.test.ts](../packages/hardhat/test/quoteHcsAnchorRoute.test.ts) catch schema drift.

## Anchor to your own HCS topic

This procedure creates a topic and enables paid Testnet message submission.
Use a funded Testnet account and keep credentials in the ignored `packages/nextjs/.env.local`.
Set `HCS_OPERATOR_ID` and a `0x`-prefixed ECDSA `HCS_OPERATOR_KEY` there.
From the repository root, run:

```bash
node --env-file=packages/nextjs/.env.local packages/nextjs/scripts/createHcsTopic.cjs
```

The [script](../packages/nextjs/scripts/createHcsTopic.cjs) creates a topic with that account's submit key.
Set `HCS_TOPIC_ID` and `HCS_ANCHOR_TOKEN` in the same server environment.
Keep the key and token private.
Without HCS configuration, the app boots with anchoring off.
The [anchor API](REFERENCE.md#api-routes) requires the bearer token, a receipt, and its confirmed transaction hash.

Run `npm run hardhat:test`.
[quoteHcsAnchorRoute.test.ts](../packages/hardhat/test/quoteHcsAnchorRoute.test.ts) checks the operator and topic submit key.
[quoteHcsVerifyRoute.test.ts](../packages/hardhat/test/quoteHcsVerifyRoute.test.ts) rejects a foreign payer.
For read-only verification of your topic, set only the public operator and topic IDs; no signing key or token is required.
For the published historical topic, leave both IDs **unset**, not empty: see [environment variables](REFERENCE.md#environment-variables).

## Host a read-only preview

Follow [hosting.md](hosting.md) for the repository root, install command, public RPC defaults and hosted smoke checks.
Hosting does not create a registry or receipt.

## Troubleshoot

| Symptom | Cause | Fix |
| --- | --- | --- |
| Scaffold stops for missing Git identity | The creator needs Git `user.name` and `user.email`. | Set both with `git config --global user.name "Your Name"` and `git config --global user.email "you@example.com"`; retry in an empty parent directory. [Tutorial](TUTORIAL.md#1-scaffold-and-start). |
| GitHub template lookup is rate-limited | The creator cannot read the template manifest. | Keep every flag in [Start here](../README.md#start-here); they pin the template choices. The [manifest-unavailable check](../scripts/ci-readme-start-here.sh) exercises this case. |
| Port 3001 is in use | Another server owns that port. | Stop that server or choose another `--port`; update local URLs too. [Start command](../README.md#start-here). |
| Reference unavailable or stale | The feed observation exceeds the registry's age policy, or its read failed. | Inspect the [preview response](../packages/nextjs/app/api/quote/preview/route.ts). If stale, wait for a fresh observation; do not weaken the policy. Historical checks use a fixed older round. |
| RPC or Mirror Node is down | An external read failed or timed out. | Retry the read later; do not record another receipt. The [compare](../packages/nextjs/app/api/quote/compare/route.ts) and [HCS verify](../packages/nextjs/app/api/quote/hcs/verify/route.ts) routes return distinct statuses. |
| A check is gray | It was skipped, unavailable, not checked, or not configured. | Read the card's status. Fix invalid local input first; retry failed reads later. For historical HCS, unset both public HCS IDs. For your topic, configure both. [Visual states](../packages/nextjs/utils/quoteCheckVisual.ts), [HCS configuration](REFERENCE.md#environment-variables). |
| Forge buttons are missing | The simulation is only offered for the published historical receipt. | Open the [historical share link](../README.md) with its transaction and HCS reference. [Forge controls](../packages/nextjs/components/quoteproof/ForgePanel.tsx). |
