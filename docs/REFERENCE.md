# Reference

## API routes

Paths are relative to the running Next.js app. The linked route source defines the full response.

| Route | Method and request | Response fields | HTTP status |
| --- | --- | --- | --- |
| [Preview](../packages/nextjs/app/api/quote/preview/route.ts) | `GET /api/quote/preview?cents=100`; decimal `cents` from 1 to 100,000,000. | Decimal strings: `nonce`, `roundId`, `price`, `decimals`, `observedAt`, `tinybars`; or `error`. | `200` success; `400` invalid cents; `502` RPC failure. |
| [Compare](../packages/nextjs/app/api/quote/compare/route.ts) | `POST /api/quote/compare` with JSON `{ "receipt": { ... } }`. | `localConsistency` (`status`, `errors`), `recordedComparison` (`status`, optional commitment/error/chain), `historicalOracle` (`status`, requested round and optional returned values/error), `context`. | `200` comparison result, including mismatches/provider errors; `400` malformed receipt; `413` oversized body. |
| [HCS verify](../packages/nextjs/app/api/quote/hcs/verify/route.ts) | `POST /api/quote/hcs/verify` with `receipt`, `transactionHash`, nonnegative integer `logIndex`, positive integer `sequenceNumber`, optional `topicId`. | `hcsAnchor.status` and optional `reason`. | `200` comparison outcome; `400` invalid input or receipt; bounded-body errors use their reported status. |
| [HCS anchor](../packages/nextjs/app/api/quote/hcs/anchor/route.ts) | `POST /api/quote/hcs/anchor` with bearer authorization and JSON `receipt`, `transactionHash`. | `hcsAnchor` with status, topic, sequence, hash, log index and transaction ID on success; `error` on failure. | `200` submitted; `400` invalid request; `401` unauthorized; `409` chain/topic guard; `503` unconfigured/disabled; `502` RPC, SDK or confirmation failure. A post-submit `502` reports `pending` and the transaction ID. |

The compare route returns `recordedComparison` as `match`, `mismatch`, `not_found`, `wrong_context`, `wrong_network`, `provider_error`, or `not_run`. `historicalOracle` is `match`, `mismatch`, `unavailable`, or `not_checked`. HCS verification is `match`, `mismatch`, `invalid`, `not_configured`, or `unavailable`. See the [four-case evidence](adversarial-evidence.md).

## Receipt JSON

The [strict parser and commitment code](../packages/hardhat/utils/quoteReceipt.ts) require exactly these 16 string fields. The HCS topic and sequence stay outside the receipt schema, in the share link.

| Fields | Meaning |
| --- | --- |
| `schemaVersion`, `chainId`, `registry` | Format and deployment context. |
| `issuer`, `nonce` | Creator and registry slot. |
| `cents`, `tinybars` | USD cents and calculated HBAR tinybars. |
| `oracle`, `feedId`, `roundId` | Feed identity and exact proxy round. |
| `price`, `decimals` | Oracle answer and scaling. |
| `observedAt`, `recordedAt`, `maximumAge` | Oracle update time, EVM block time and policy bound. |
| `commitment` | `keccak256` fingerprint of the 15 quote fields. |

`observedAt` and `recordedAt` are not Hedera's per-transaction consensus timestamp. The published reference is Testnet chain `296`, registry `0xa1a741aF6e0A45164e2Af6A1C35dC30275629709`, and Chainlink proxy `0x59bC155EB6c6C415fE43255aF66EcF0523c92B4a`.

## Verifier flags

Run the [standalone verifier](../packages/hardhat/scripts/verifyQuote.ts) from the repository root with `npm run verify:quote -w @sh/hardhat -- --input ../../examples/receipt-testnet.json`. The workspace resolves `--input` from `packages/hardhat`.

| Flag | Effect |
| --- | --- |
| `--input <path>` | Required receipt JSON. |
| `--expected-chain-id <decimal>` | Expected chain; defaults to Testnet `296` unless foreign context is allowed. |
| `--expected-registry <address>`, `--expected-oracle <address>` | Expected deployment; otherwise read from the local Testnet deployment artifact. Supply both for the published fixture in a fresh scaffold. |
| `--expected-issuer <address>` | Check issuer identity. |
| `--expected-commitment <bytes32>`, `--expected-issuer <address>`, `--expected-nonce <decimal>` | Complete independent issued-quote reference. Do not derive it from the receipt under test. |
| `--compare-stored` | Read registry and historical oracle data through JSON-RPC. |
| `--rpc-url <url>` | Override the read-only RPC for `--compare-stored`; otherwise use `HEDERA_RPC_URL` or the Testnet default. |
| `--allow-foreign-context` | Permit context outside the published Testnet deployment. |

For the committed historical receipt:

```bash
npm run verify:quote -w @sh/hardhat -- --input ../../examples/receipt-testnet.json --expected-chain-id 296 --expected-registry 0xa1a741aF6e0A45164e2Af6A1C35dC30275629709 --expected-oracle 0x59bC155EB6c6C415fE43255aF66EcF0523c92B4a --compare-stored --rpc-url https://testnet.hashio.io/api
```

Expect local `valid`, historical oracle `match`, and stored record `match` when the public RPC is available.

## Contract interface

[QuoteProofRegistry.sol](../packages/hardhat/contracts/QuoteProofRegistry.sol) exposes `previewQuote(cents)` for a bounded read, `createQuote(cents, expectedRound, expectedNonce)` for a guarded write, `getCommitment(issuer, nonce)` and `isStoredCommitment(issuer, nonce, commitment)` for read-back. It also exposes `oracle`, `expectedDecimals`, `maxAge` and `nonces(issuer)` getters. `QuoteRecorded(bytes32 indexed commitment, QuoteData quote)` emits the quote fields after storage. The contract rechecks the observation and nonce before emitting it.

## npm scripts and file map

The root [package scripts](../package.json) include `npm run demo`, `npm run next:dev`, `npm run next:build`, `npm run lint`, `npm run hardhat:test`, `npm run hardhat:compile`, `npm run hardhat:check-types`, `npm run next:check-types`, `npm run hardhat:deploy`, and account commands. [Hardhat workspace scripts](../packages/hardhat/package.json) add `quote:e2e` and `verify:quote`.

- [Registry contract](../packages/hardhat/contracts/QuoteProofRegistry.sol): policy, commitment and event.
- [Receipt code](../packages/hardhat/utils/quoteReceipt.ts) and [comparison code](../packages/hardhat/utils/quoteReceiptComparison.ts): parsing, fingerprint and comparisons.
- [Verifier](../packages/hardhat/scripts/verifyQuote.ts): exported JSON checks.
- [Preview](../packages/nextjs/app/api/quote/preview/route.ts), [compare](../packages/nextjs/app/api/quote/compare/route.ts), [HCS verify](../packages/nextjs/app/api/quote/hcs/verify/route.ts), and [HCS anchor](../packages/nextjs/app/api/quote/hcs/anchor/route.ts) routes.
- [UI composition](../packages/nextjs/components/QuoteProofExperience.tsx) and [quoteproof components](../packages/nextjs/components/quoteproof/): preview, guarded write, event-bound receipt, share/export, forge controls and comparison cards.
- [Tamper demo](../scripts/demo.mjs): genuine and altered fixture cases.
- [Release evidence](release-evidence.md) and [dated dependency audit](security.md).
- [MIT license and upstream notice](../LICENSE).

## Environment variables

These are the entries in [Hardhat's example](../packages/hardhat/.env.example) and [Next.js's example](../packages/nextjs/.env.example). Keep private values only in ignored local files or server environment.

| Name | Package | Required or optional | Public or secret | Enables | Safe default |
| --- | --- | --- | --- | --- | --- |
| `HEDERA_RPC_URL` | Hardhat | Optional | Public | Script and verifier JSON-RPC target. | `https://testnet.hashio.io/api` |
| `DEPLOYER_PRIVATE_KEY_ENCRYPTED` | Hardhat | Required for a new Testnet write | Secret | Local encrypted deployer account. | Empty; generate or import locally. |
| `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID` | Next.js | Optional | Public | WalletConnect provider use. | App's built-in project ID. |
| `NEXT_PUBLIC_HEDERA_MAINNET_RPC_URL` | Next.js | Optional | Public | Mainnet wallet RPC. | `https://mainnet.hashio.io/api` |
| `NEXT_PUBLIC_HEDERA_TESTNET_RPC_URL` | Next.js | Optional | Public | Testnet wallet and quote API RPC. | `https://testnet.hashio.io/api` |
| `HCS_OPERATOR_ID` | Next.js | Optional; required for own-topic read-back or anchoring | Public | Expected HCS message payer and server operator. | Empty; historical verification has a pinned public ID. |
| `HCS_OPERATOR_KEY` | Next.js | Required for anchoring | Secret | Server ECDSA signing and submit key. | Empty; anchoring stays off. |
| `HCS_TOPIC_ID` | Next.js | Optional; required for own-topic read-back or anchoring | Public | Topic to verify or submit to. | Empty; historical verification has a pinned public topic. |
| `HCS_ANCHOR_TOKEN` | Next.js | Required for anchoring | Secret | Bearer authorization on the anchor route. | Empty; requests receive `401`. |

The two public HCS IDs alone enable read-only verification of your own topic. The key and token are not needed for a read-only preview.
