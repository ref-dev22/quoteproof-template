# Agent instructions

QuoteProof is a Scaffold-HBAR-derived Next.js/Hardhat app. Keep upstream attribution intact, but follow this repository's QuoteProof contract and receipt workflow rather than the starter's sample-token or Foundry workflow. Do not copy private task notes, credentials, model transcripts, or vault paths into this repository.

## Commands

Use the committed `npm` lockfile and Node.js `>=20.18.3`:

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

Run the wallet-free preview with `npm run next:dev -- --hostname 0.0.0.0 --port 3001` and open `http://localhost:3001`. The preview and deterministic tests need no wallet, faucet, account key, paid API, or live write. Testnet deployment and receipt creation are owner-authorized, credentialed actions and must stay local:

```bash
npm run hardhat:account:generate
npm run hardhat:account:import
npm run hardhat:deploy -- --network hederaTestnet --tags QuoteProof
npm run quote:e2e -w @sh/hardhat -- --network hederaTestnet --cents 100 --output ./quoteproof-receipt.json
npm run verify:quote -w @sh/hardhat -- --input ./quoteproof-receipt.json
```

The verifier loads the registry and oracle from the ignored local `deployments/hederaTestnet/QuoteProofRegistry.json` after this deploy. Supply explicit expected addresses when checking the committed historical fixture from a fresh source export.

Never paste keys or encrypted keystores into chat, source, browser fields, or committed files. Do not repeat the historical testnet write merely to demonstrate the app.

## QuoteProof architecture

- `packages/hardhat/contracts/QuoteProofRegistry.sol` — fixed Chainlink HBAR/USD reference, freshness/round/nonce guards, ceiling-to-tinybar arithmetic, and the event-bound `QuoteRecorded` receipt.
- `packages/hardhat/utils/quoteReceipt.ts` — strict JSON parser, commitment calculation, independent arithmetic verifier, and offline-only result (`onChainVerified: false`).
- `packages/hardhat/utils/quoteReceiptComparison.ts` — pure stored, historical-oracle, and independently supplied expected-quote comparisons.
- `packages/hardhat/scripts/verifyQuote.ts` — standalone local verifier with optional direct read-only registry/oracle comparison; it does not require the Next.js server.
- `packages/nextjs/components/QuoteProofExperience.tsx` — composition and quote state; `packages/nextjs/components/quoteproof/` — preview and guarded write card, event-bound receipt, share/export UI, forge controls, and read-only comparison display.
- `packages/nextjs/app/api/quote/preview/route.ts` — server-side live reference read; no wallet-originating `from` address.
- `packages/nextjs/app/api/quote/compare/route.ts` — bounded JSON request, offline verification, RPC `eth_chainId` check, then read-only stored-commitment and exact historical-oracle-round checks.
- `packages/nextjs/contracts/quoteProofContext.ts` — one QuoteProof registry context sourced from generated `deployedContracts.ts` for preview, receipt UI and comparison; the fixed testnet oracle remains explicit.
- `packages/hardhat/test/QuoteProofRegistry.test.ts`, `quoteReceipt.test.ts`, and `quoteCompareRoute.test.ts` — contract, verifier, adversarial, and route-guard coverage.

The published reference context is Hedera Testnet chain `296`, registry `0xa1a741aF6e0A45164e2Af6A1C35dC30275629709`, and Chainlink oracle `0x59bC155EB6c6C415fE43255aF66EcF0523c92B4a`. After a credentialed testnet deployment, `generateTsAbis` updates the registry used by Scaffold hooks and QuoteProof routes/UI; restart Next.js and use a receipt from the new deployment. The committed historical fixture remains bound to the published reference registry. Offline consistency is not recorded-state proof: a recomputed amount forgery can match the exact historical oracle observation but must fail the stored-commitment comparison; a false-price copy must fail both. An authentic different receipt can pass its own stored slot but must fail an independently supplied expected-quote reference. Provider errors, unavailable/not-checked historical observations, wrong network, wrong context, missing records, and local receipt errors remain distinct.

## Feature map

| Feature | Starts at | Key files | Verify and gotchas |
| --- | --- | --- | --- |
| Preview | UI reference card | `packages/nextjs/components/quoteproof/PreviewRecordCard.tsx`, `packages/nextjs/app/api/quote/preview/route.ts` | `curl 'http://localhost:3001/api/quote/preview?cents=100'`; live feed/RPC can be stale or unavailable. |
| Guarded record | UI record button | `packages/nextjs/components/quoteproof/PreviewRecordCard.tsx`, `packages/hardhat/contracts/QuoteProofRegistry.sol` | `npm run hardhat:test`; wallet, Testnet and fresh round are required for a write. Use mocks in CI. |
| Share link and four checks | `?tx=...&hcsTopic=...&hcsSeq=...` | `packages/nextjs/components/quoteproof/ReceiptProofCard.tsx`, `packages/nextjs/app/api/quote/compare/route.ts`, `packages/nextjs/app/api/quote/hcs/verify/route.ts` | `bash scripts/ci-judge-health.sh` with `BASE_URL=http://localhost:3001`; historical checks expect the published reference registry and public RPC/Mirror Node. |
| Forge simulation | UI **Try to forge this receipt** | `packages/nextjs/components/quoteproof/ForgePanel.tsx`, `packages/nextjs/utils/quoteForge.ts`, `examples/adversarial/` | `npm run hardhat:test` and `node scripts/ci-judge-browser.cjs` with `BASE_URL` and `PLAYWRIGHT_MODULE`; only the published historical receipt shows the controls. |
| Export and CLI verify | Receipt export / `npm run verify:quote` | `packages/nextjs/components/quoteproof/ReceiptProofCard.tsx`, `packages/hardhat/scripts/verifyQuote.ts`, `packages/hardhat/utils/quoteReceipt.ts` | Run the [historical verifier command](docs/HOW-TO.md#inspect-the-historical-receipt); independent expected values matter. RPC comparison is optional. |
| HCS anchor | `/api/quote/hcs/anchor` | `packages/nextjs/app/api/quote/hcs/anchor/route.ts`, `packages/nextjs/utils/quoteHcs.ts` | `npm run hardhat:test`; server key, bearer token and confirmed event are required; no HCS writes in CI. |
| Tamper demo | `npm run demo` | `scripts/demo.mjs`, `packages/hardhat/scripts/demoCases.ts`, `examples/adversarial/` | `npm run demo`; local checks work offline and optional network checks can skip. |
| Health and browser checks | Scheduled workflow or local scripts | `.github/workflows/judge-health.yml`, `scripts/ci-judge-health.sh`, `scripts/ci-judge-browser.cjs` | Set `BASE_URL` for localhost; published-reference checks depend on external RPC/Mirror Node. |

## Verify your change

Run the relevant tests, then `npm run next:dev -- --hostname 0.0.0.0 --port 3001`. Point both API and browser checks at the running app with `BASE_URL=http://localhost:3001 bash scripts/ci-judge-health.sh` and `BASE_URL=http://localhost:3001 PLAYWRIGHT_MODULE=<playwright-install> node scripts/ci-judge-browser.cjs`; inspect the light/dark screenshots in `judge-browser-artifacts/`. The historical checks require the published registry and receipt, so a scaffold using your own new deployment needs its own fixtures.

## Change guidance

Use the existing Wagmi/Scaffold-HBAR hooks (`useScaffoldReadContract`, `useScaffoldWriteContract`, `useTransactor`) and DaisyUI classes. Keep the write path guarded by a valid preview, connected account, Hedera Testnet, current nonce/round, and single pending transaction. Rejection, wrong-network, pending, duplicate-click, stale, changed-round, and unavailable-feed paths must never trigger an automatic retry or a second live write; use deterministic mocks/fixtures for additional coverage.

Keep public CI deterministic: `npm ci`, compile, Hardhat tests/types/lint, frontend types/lint, and production build. Do not add a deploy, fork, wallet unlock, secret, or paid provider to CI. The repo currently contains Hardhat only; do not invent Foundry commands.

When adjusting deployment addresses, update the generated-contract pipeline rather than adding a reference address to a route or UI component. Run the alternate-registry preview and comparison tests before release.

For the disposable mock-only freshness-policy adaptation, follow [`docs/local-policy-workshop.md`](docs/local-policy-workshop.md). It must not change the live deployment, historical receipt, receipt schema, or guarded wallet-write path.
