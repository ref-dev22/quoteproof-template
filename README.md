# QuoteProof — Scaffold-HBAR reference-quote template

QuoteProof is a small Hedera dApp that makes a Chainlink HBAR/USD reference quote inspectable before a wallet write. Enter a bounded USD amount, read the configured testnet observation, and—only when a supported wallet is ready—record an event-bound receipt. The contract records evidence; it never transfers HBAR and does not confirm a payment.

The current public checkout is a reviewable local release candidate built on Scaffold-HBAR. It keeps the upstream Hardhat/Next.js structure, adds the QuoteProof registry, adversarial tests, a standalone receipt verifier, and a focused judge/developer experience.

## Try the experience

The preview is wallet-free. A wallet, faucet funds, and a deployment are not needed to inspect the live configured reference:

```bash
npm install
npm run next:dev
```

Open `http://localhost:3000`. The page shows the testnet chain, source, USD per HBAR, observation age, ceiling-to-tinybar quantity, round, feed ID, oracle, and recovery actions. Recording is a separate wallet-gated step. Do not click the write action unless you intend to submit a testnet transaction.

The deployed testnet context used by this release candidate is:

- Chain: Hedera Testnet, `296`
- QuoteProofRegistry: `0xa1a741aF6e0A45164e2Af6A1C35dC30275629709`
- Chainlink oracle: `0x59bC155EB6c6C415fE43255aF66EcF0523c92B4a`
- Feed label: `HBAR / USD`; feed identifier is the contract's `FEED_ID`

## Create a project from the CLI

The official CLI is interactive:

```bash
npm create scaffold-hbar@latest
# equivalent:
npx create-scaffold-hbar@latest
```

Choose the template, Next.js frontend, Hardhat or Foundry, and network in the prompts. For non-interactive scaffolding, the CLI supports `--yes`, `--template`, `--frontend`, `--solidity-framework`, `--network`, and `--skip-install`. See the [create-scaffold-hbar CLI](https://github.com/hedera-dev/create-scaffold-hbar) for the current option names.

This checkout has no configured public `origin` or remote template manifest, so a remote `npm create ... --template owner/repo` run is intentionally not claimed as tested here. The local candidate is ready for that reversible publishing gate.

## Work from this checkout

Use the committed npm lockfile and Node.js `>=20.18.3`.

```bash
npm install

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
npm run quote:e2e -w @sh/hardhat -- --cents 100
npm run verify:quote -w @sh/hardhat -- --input <receipt.json>
```

Never put a private key, encrypted keystore, or funded-account material in the repository or browser environment. Testnet credentials stay local and ignored.

## How QuoteProof works

1. The UI stores the entered USD amount as cents, bounded to `1..100,000,000` cents.
2. A server-side read route calls the configured testnet RPC for `previewQuote`; no wallet-originating `from` address is needed for preview.
3. The registry reads the fixed oracle, validates positive answer/freshness/decimals, and calculates tinybars with ceiling division. The current demo policy allows observations up to `93,600` seconds old.
4. A wallet write calls `createQuote(cents, expectedRound, expectedNonce)`. The contract rechecks the round and nonce before emitting `QuoteRecorded`.
5. The receipt card decodes the actual event from the transaction receipt. A share URL can be opened without the original wallet; the standalone verifier checks chain, registry, issuer, commitment, and stored state.

This is a reference quote, not a payment, balance guarantee, or real-time market feed. The oracle replacement boundary is the registry constructor/provider interface; changing the provider requires a new deployment and fresh provenance checks.

## Recovery and failure exercises

- Invalid amount: enter `0.01`–`$1,000,000.00`; no RPC write is sent for invalid input.
- Stale or unavailable feed: refresh after the source satisfies the freshness policy; no automatic write or retry transaction is created.
- Changed round: refresh once and review the new quote; the guarded write rejects a changed observation.
- Rejected signature: nothing is recorded; reconnect or retry only after reviewing the quote.
- Pending or indexing delay: controls remain guarded, and a share URL waits for the receipt without submitting another transaction.
- Altered receipt: the standalone verifier reports invalid commitment/state rather than presenting it as confirmed.

The page keeps calculation-only, confirmed, unavailable, and invalid states visibly distinct. Executable guidance points to `QuoteProofRegistry.test.ts`, `quoteReceipt.test.ts`, and `npm run verify:quote`.

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
- `LICENCE` — MIT license and upstream notice
- `AGENTS.md` — concise contributor/build guidance for this checkout

AI-assisted implementation and review were used for this release candidate. The evidence is reproducible from the commands above; no private vault instructions, credentials, or private task material are part of the public template.

## Release status

The isolated baseline, live testnet provenance, contract guards, genuine testnet quote proof, and browser-tested experience are recorded in the private evidence index while the public checkout remains reviewable. A remote template publication, clean-room scaffold run from that remote template, and final contest submission are separate gates and are not claimed by this local README.
