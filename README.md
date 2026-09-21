# QuoteProof — Scaffold-HBAR reference-quote template

QuoteProof is a small Hedera dApp that makes a Chainlink HBAR/USD reference quote inspectable before a wallet write. Enter a bounded USD amount, read the configured testnet observation, and—only when a supported wallet is ready—record an event-bound receipt. The contract records evidence; it never transfers HBAR and does not confirm a payment.

The current public checkout is a reviewable local release candidate built on Scaffold-HBAR. It keeps the upstream Hardhat/Next.js structure, adds the QuoteProof registry, adversarial tests, a standalone receipt verifier, and a focused judge/developer experience.

## Try the experience

The preview is wallet-free. A wallet, faucet funds, and a deployment are not needed to inspect the live configured reference:

```bash
npm ci
npm run next:dev
```

Open `http://localhost:3000`. The page shows the testnet chain, source, USD per HBAR, observation age, ceiling-to-tinybar quantity, round, feed ID, oracle, and recovery actions. Recording is a separate wallet-gated step. Do not click the write action unless you intend to submit a testnet transaction.

The page being reachable is not proof that the live reference read succeeded. Confirm the preview card has a price, round, observation age, and quantity; the card must not say `Reference unavailable`.

The deployed testnet context used by this release candidate is:

- Chain: Hedera Testnet, `296`
- QuoteProofRegistry: `0xa1a741aF6e0A45164e2Af6A1C35dC30275629709`
- Chainlink oracle: `0x59bC155EB6c6C415fE43255aF66EcF0523c92B4a`
- Feed label: `HBAR / USD`; feed identifier is the contract's `FEED_ID`

Historical confirmed testnet proof (read-only): [QuoteProof transaction on HashScan](https://hashscan.io/testnet/tx/0x076690438e81f96fc77f3f6467157d2f53c05703ef098790a42b82909a340ef9) · [Mirror Node result](https://testnet.mirrornode.hedera.com/api/v1/contracts/results/0x076690438e81f96fc77f3f6467157d2f53c05703ef098790a42b82909a340ef9) (`SUCCESS`). This is historical evidence; do not repeat it.

## Create a project from the CLI

The official CLI is interactive. The current proposed public repository for this candidate is `ref-dev22/quoteproof-template`, branch `main`:

```bash
npm create scaffold-hbar@latest
# equivalent:
npx create-scaffold-hbar@latest
```

Choose the template, Next.js frontend, Hardhat or Foundry, and network in the prompts. After publication and owner approval, the exact external-template smoke command is:

```bash
npx create-scaffold-hbar@latest quoteproof --template ref-dev22/quoteproof-template#main --frontend nextjs-app --solidity-framework hardhat --network testnet --package-manager npm --ci --skip-hedera-skills
```

This candidate's `template.json` intentionally selects Next.js, Hardhat, and npm. The current CLI supports npm and Yarn; do not infer package-manager behavior from older yarn-only README text. `--ci` is non-interactive and installs Hedera Skills by default, so `--skip-hedera-skills` is included for a minimal reproducible smoke run. See the [create-scaffold-hbar CLI](https://github.com/hedera-dev/create-scaffold-hbar) and its [template manifest source](https://raw.githubusercontent.com/hedera-dev/create-scaffold-hbar/main/src/types.ts) for the current option and manifest contract.

The local candidate has no configured public `origin`, so the command above is a prepared publication gate, not a claim that the remote scaffold has already been tested. The CLI fetches community templates from `org/repo` or `org/repo#branch`, reads `template.json`, then removes that manifest from the generated project.

## Prerequisites and safe testnet setup

- Node.js `>=20.18.3`, Git with `user.name` and `user.email`, and npm.
- This candidate uses Hardhat, so Foundry is not required.
- No wallet, faucet funds, account key, or paid API is needed for the preview or deterministic tests.
- The deployer setup is local and encrypted. From the repository root, run one of:

  ```bash
  npm run hardhat:account:generate
  npm run hardhat:account:import
  ```

  Generation creates a new wallet and encrypts it into `packages/hardhat/.env`. Import prompts for an existing private key and encrypts it into the same ignored file. Never paste either key into chat, a browser, a committed `.env`, or a public issue.
- Create or use a Hedera Portal testnet account, then fund it at the [Hedera Portal faucet](https://portal.hedera.com/faucet). Confirm the account is a Hedera-created ECDSA account before deployment.
- Deploy only after reviewing the target network and contract tags:

  ```bash
  npm run hardhat:deploy -- --network hederaTestnet --tags QuoteProof
  ```

  The command prompts once for the local encryption password. It does not use the browser wallet. Testnet credentials remain local and ignored.

## Work from this checkout

Use the committed npm lockfile and Node.js `>=20.18.3`. `npm ci` is the reproducible install; use `npm install` only when intentionally changing dependencies.

```bash
npm ci

# deterministic checks
npm run hardhat:test
npm run hardhat:compile
npm run next:check-types
npm run next:lint
npm run next:build

# local fork workflow, in separate terminals
npm run hardhat:chain
npm run hardhat:deploy -- --network localhost
npm run next:dev
```

Testnet deployment and receipt creation require a Hedera-created ECDSA account and local credentials. Preview and the deterministic contract tests do not.

```bash
# requires the local encrypted deployer setup
npm run hardhat:deploy -- --network hederaTestnet --tags QuoteProof
npm run quote:e2e -w @sh/hardhat -- --network hederaTestnet --cents 100 --output ./quoteproof-receipt.json
npm run verify:quote -w @sh/hardhat -- --input ./quoteproof-receipt.json
```

Never put a private key, encrypted keystore, or funded-account material in the repository or browser environment. Testnet credentials stay local and ignored.

## How QuoteProof works

1. The UI stores the entered USD amount as cents, bounded to `1..100,000,000` cents.
2. A server-side read route calls the configured testnet RPC for `previewQuote`; no wallet-originating `from` address is needed for preview.
3. The registry reads the fixed oracle, validates positive answer/freshness/decimals, and calculates tinybars with ceiling division. The current demo policy allows observations up to `93,600` seconds old.
4. A wallet write calls `createQuote(cents, expectedRound, expectedNonce)`. The contract rechecks the round and nonce before emitting `QuoteRecorded`.
5. The receipt card decodes the actual event from the transaction receipt. A share URL can be opened without the original wallet. The standalone verifier checks the receipt schema, supplied chain/registry/oracle/issuer bindings, arithmetic, and commitment offline; the read-only `POST /api/quote/compare` route then reports three distinct results: local consistency, the configured oracle's exact historical `getRoundData` observation (plus current decimals metadata), and the stored issuer/nonce record in the trusted testnet registry. It never signs or submits a transaction.

This is a reference quote, not a payment, balance guarantee, or real-time market feed. The oracle replacement boundary is the registry constructor/provider interface; changing the provider requires a new deployment and fresh provenance checks.

## Recovery and failure exercises

- Invalid amount: enter `0.01`–`$1,000,000.00`; no RPC write is sent for invalid input.
- Stale or unavailable feed: refresh after the source satisfies the freshness policy; no automatic write or retry transaction is created.
- Changed round: refresh once and review the new quote; the guarded write rejects a changed observation.
- Rejected signature: nothing is recorded; reconnect or retry only after reviewing the quote.
- Pending or indexing delay: controls remain guarded, and a share URL waits for the receipt without submitting another transaction.
- Altered receipt: the standalone verifier reports an invalid commitment rather than presenting it as confirmed; the stored-state comparison is separate. A consistently recomputed forged copy can pass local arithmetic and commitment checks, but it still reports `mismatch` against the genuine stored commitment.

The page keeps calculation-only, confirmed, unavailable, and invalid states visibly distinct. Executable guidance points to `QuoteProofRegistry.test.ts`, `quoteReceipt.test.ts`, and `npm run verify:quote`.

## Verify the live preview and a historical receipt

With the app running, the wallet-free preview endpoint is a direct read-only check:

```bash
curl -i "http://localhost:3000/api/quote/preview?cents=100"
```

Expected result: HTTP `200` and JSON with decimal-string fields `nonce`, `roundId`, `price`, `decimals`, `observedAt`, and `tinybars`. A `400` means the cents query is invalid; a `502` means the configured reference RPC is unavailable. HTTP `200` alone is not enough—the response must contain those fields and the page must render the corresponding live preview values.

To inspect the historical confirmed receipt in a fresh browser session, open the [share route](http://localhost:3000/?tx=0x076690438e81f96fc77f3f6467157d2f53c05703ef098790a42b82909a340ef9). Confirm the `Confirmed on Hedera testnet` badge, event-bound receipt fields, transaction link, and Mirror Node link. Use `Export receipt JSON` to compare the downloaded commitment and quote fields with the displayed event; `Copy share link` must reproduce the same `?tx=` route. To exercise tamper handling, change only the exported commitment in a temporary copy and run the standalone verifier; it must return exit code `2` and `valid: false`. This is read-only and does not send another transaction.

When an event-bound receipt is visible, `Compare stored commitment` exercises the read-only comparison. The API accepts `{ "receipt": <receipt-json> }` at `POST /api/quote/compare`; it first runs the offline verifier, then checks the provider chain ID, reads the configured oracle's exact historical round and current decimals, and reads `getCommitment` and `isStoredCommitment` from the configured registry. A genuine receipt should produce local `valid`, historical-oracle `match`, and stored-record `match`; a simple tamper should produce `invalid` / `not_checked` / `not_run`; a recomputed amount forgery can produce `valid` / `match` / `mismatch`; and a recomputed false-price copy should produce `valid` / `mismatch` / `mismatch`. An unknown issuer/nonce should produce `valid` / `match` / `not_found`; a wrong RPC chain is reported as `wrong_network` before registry getters run. Historical source failures are `unavailable`, while provider failures in the registry path are `provider_error`; neither turns local consistency into on-chain proof. Requests are bounded before JSON parsing.

## Environment variables

All are optional for the wallet-free preview unless noted.

| Variable | Visibility | Default / use |
| --- | --- | --- |
| `NEXT_PUBLIC_HEDERA_TESTNET_RPC_URL` | public | `https://testnet.hashio.io/api`; browser scaffold reads and server preview route use it |
| `NEXT_PUBLIC_HEDERA_MAINNET_RPC_URL` | public | `https://mainnet.hashio.io/api` |
| `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID` | public | Scaffold fallback project id; replace for your own WalletConnect project |
| `HEDERA_MIRROR_TESTNET_URL` | server | `https://testnet.mirrornode.hedera.com` |
| `HEDERA_MIRROR_MAINNET_URL` | server | `https://mainnet.mirrornode.hedera.com` |
| `PORT` | local server | Next.js metadata fallback port, normally `3000` |
| `NEXT_PUBLIC_IGNORE_BUILD_ERROR` | public build flag | `false`; diagnostics-only escape hatch, do not use for a release gate |
| `HEDERA_RPC_URL` | server | Hardhat/quote scripts; defaults to the testnet Hashio URL |
| `HEDERA_FORKING` | local test flag | Set `true` for the Hedera-forked Hardhat node/test suite |
| `MAINNET_FORKING_ENABLED` | local test flag | Set `true` only for the explicit mainnet-fork workflow |
| `DEPLOYER_PRIVATE_KEY_ENCRYPTED` | secret, local only | Encrypted account material consumed by the account/deploy scripts |
| `__RUNTIME_DEPLOYER_PRIVATE_KEY` | secret, process-only | Temporary script-injected key; never set in a committed `.env` |
| `QUOTE_CENTS` | local script input | Optional quote-script cents override |
| `QUOTE_OUTPUT` | local script output | Optional path for a sanitized quote JSON artifact |

## Repository and notices

- `packages/hardhat/contracts/QuoteProofRegistry.sol` — registry and event schema
- `packages/hardhat/test/` — deterministic contract and receipt/verifier tests
- `packages/hardhat/scripts/verifyQuote.ts` — standalone verifier
- `packages/nextjs/components/QuoteProofExperience.tsx` — focused UI
- `packages/nextjs/app/api/quote/preview/route.ts` — wallet-free live preview read
- `packages/nextjs/app/api/quote/compare/route.ts` — read-only local, historical-oracle, and stored-receipt comparison
- `packages/hardhat/utils/quoteReceiptComparison.ts` — stored commitment status helper
- `DEMO-SCRIPT.md` — reproducible 90-second read-only demo, including the API-only forged-copy case
- `LICENCE` — MIT license and upstream notice
- `AGENTS.md` — concise contributor/build guidance for this checkout
- `SUBMISSION-DRAFT.md` — proposed repository, exact external scaffold command, and owner-gated release checklist

AI-assisted implementation and review were used for this release candidate. The evidence is reproducible from the commands above; no private vault instructions, credentials, or private task material are part of the public template.

## Release status

The isolated baseline, live testnet provenance, contract guards, genuine testnet quote proof, and browser-tested experience are recorded in the private evidence index while the public checkout remains reviewable. A remote template publication, clean-room scaffold run from that remote template, and final contest submission are separate gates and are not claimed by this local README.
