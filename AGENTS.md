# Agent instructions

QuoteProof is a Scaffold-HBAR-derived Next.js/Hardhat app. Keep upstream attribution intact, but follow this repository's QuoteProof contract and receipt workflow rather than the starter's sample-token or Foundry workflow. Do not copy private task notes, credentials, model transcripts, or vault paths into this repository.

## Commands

Use the committed npm lockfile and Node.js `>=20.18.3`:

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

Run the wallet-free preview with `npm run next:dev` and open `http://localhost:3000`. The preview and deterministic tests need no wallet, faucet, account key, paid API, or live write. Testnet deployment and receipt creation are owner-authorized, credentialed actions and must stay local:

```bash
npm run hardhat:account:generate
npm run hardhat:account:import
npm run hardhat:deploy -- --network hederaTestnet --tags QuoteProof
npm run quote:e2e -w @sh/hardhat -- --network hederaTestnet --cents 100 --output ./quoteproof-receipt.json
npm run verify:quote -w @sh/hardhat -- --input ./quoteproof-receipt.json
```

Never paste keys or encrypted keystores into chat, source, browser fields, or committed files. Do not repeat the historical testnet write merely to demonstrate the app.

## QuoteProof architecture

- `packages/hardhat/contracts/QuoteProofRegistry.sol` — fixed Chainlink HBAR/USD reference, freshness/round/nonce guards, ceiling-to-tinybar arithmetic, and the event-bound `QuoteRecorded` receipt.
- `packages/hardhat/utils/quoteReceipt.ts` — strict JSON parser, commitment calculation, independent arithmetic verifier, and offline-only result (`onChainVerified: false`).
- `packages/hardhat/utils/quoteReceiptComparison.ts` — pure stored, historical-oracle, and independently supplied expected-quote comparisons.
- `packages/hardhat/scripts/verifyQuote.ts` — standalone local verifier with optional direct read-only registry/oracle comparison; it does not require the Next.js server.
- `packages/nextjs/components/QuoteProofExperience.tsx` — wallet-free preview, guarded wallet write, event-bound receipt, share/export UI, and read-only comparison display.
- `packages/nextjs/app/api/quote/preview/route.ts` — server-side live reference read; no wallet-originating `from` address.
- `packages/nextjs/app/api/quote/compare/route.ts` — bounded JSON request, offline verification, RPC `eth_chainId` check, then read-only stored-commitment and exact historical-oracle-round checks.
- `packages/hardhat/test/QuoteProofRegistry.test.ts`, `quoteReceipt.test.ts`, and `quoteCompareRoute.test.ts` — contract, verifier, adversarial, and route-guard coverage.

The trusted release context is Hedera Testnet chain `296`, registry `0xa1a741aF6e0A45164e2Af6A1C35dC30275629709`, and Chainlink oracle `0x59bC155EB6c6C415fE43255aF66EcF0523c92B4a`. Offline consistency is not recorded-state proof: a recomputed amount forgery can match the exact historical oracle observation but must fail the stored-commitment comparison; a false-price copy must fail both. An authentic different receipt can pass its own stored slot but must fail an independently supplied expected-quote reference. Provider errors, unavailable/not-checked historical observations, wrong network, wrong context, missing records, and local receipt errors remain distinct.

## Change guidance

Use the existing Wagmi/Scaffold-HBAR hooks (`useScaffoldReadContract`, `useScaffoldWriteContract`, `useTransactor`) and DaisyUI classes. Keep the write path guarded by a valid preview, connected account, Hedera Testnet, current nonce/round, and single pending transaction. Rejection, wrong-network, pending, duplicate-click, stale, changed-round, and unavailable-feed paths must never trigger an automatic retry or a second live write; use deterministic mocks/fixtures for additional coverage.

Keep public CI deterministic: `npm ci`, compile, Hardhat tests/types/lint, frontend types/lint, and production build. Do not add a deploy, fork, wallet unlock, secret, or paid provider to CI. The repo currently contains Hardhat only; do not invent Foundry commands.
