# Reference

## API routes

These tables describe the exported handlers, not requests for new Testnet writes.
All quote POST bodies are limited to 64 KiB.
See the linked route for validation order and [bounded body handling](../packages/nextjs/utils/boundedBody.ts).

| Method and route | Request fields | Response fields | HTTP status codes |
| --- | --- | --- | --- |
| GET [/api/quote/preview](../packages/nextjs/app/api/quote/preview/route.ts) | Query `cents`: digits, 1–100,000,000, at most 32 characters. | Success: decimal strings `nonce`, `roundId`, `price`, `decimals`, `observedAt`, `tinybars`. Error: `error`. | 200 success; 400 invalid cents; 502 RPC, wrong chain, call or feed failure. |
| POST [/api/quote/compare](../packages/nextjs/app/api/quote/compare/route.ts) | JSON `receipt`: the receipt object below. | `localConsistency`, `recordedComparison`, `historicalOracle`, `context`; details below. Oversized body: `error`. | 200 comparison result, including invalid arithmetic/context or provider errors; 400 malformed request/receipt shape; 413 oversized request. |
| POST [/api/quote/hcs/verify](../packages/nextjs/app/api/quote/hcs/verify/route.ts) | JSON `receipt`, `transactionHash` (32-byte hex), `logIndex` (safe integer ≥0), `sequenceNumber` (safe integer >0); optional `topicId` must match the selected topic. | `hcsAnchor.status`, optional `hcsAnchor.reason`. | 200 match, mismatch, unavailable or not_configured; 400 invalid reference, body or receipt; 413 oversized request. |
| POST [/api/quote/hcs/anchor](../packages/nextjs/app/api/quote/hcs/anchor/route.ts) | Header `Authorization: Bearer <server token>`; JSON `receipt`, `transactionHash`. | Success: `hcsAnchor` with `status: submitted`, `topicId`, `sequenceNumber`, `transactionHash`, `logIndex`, `hcsTransactionId`. Errors: `error`; pending confirmation also includes `hcsAnchor.status: pending` and `hcsTransactionId`. | 200 submitted; 400 invalid input; 401 missing/wrong authorization; 409 wrong network, unconfirmed/ambiguous event, or submit-key mismatch; 413 oversized body; 502 confirmation/submission/read failure; 503 missing/disabled HCS config or operator mismatch. |
| GET [/api/hedera/account](../packages/nextjs/app/api/hedera/account/route.ts) | Query `evm`: 20-byte hex address; optional `network`, defaults to `testnet`. `mainnet` selects Mainnet; unknown values fall back to Testnet. | `accountId` (string or null); errors: `error`, and upstream `status` when present. | 200 result, including null for Mirror 404; 400 invalid address; 502 Mirror/read failure. |

### Compare response

[Comparison types and handler](../packages/nextjs/app/api/quote/compare/route.ts) define these fields:

| Object | Fields and values |
| --- | --- |
| `localConsistency` | `status`: `valid`, `invalid`, `wrong_context`; `errors`: string array. |
| `recordedComparison` | `status`: `match`, `mismatch`, `not_found`, `wrong_context`, `wrong_network`, `provider_error`, `not_run`; optional `storedCommitment`, `error`, `providerChainId`. |
| `historicalOracle` | `status`: `match`, `mismatch`, `unavailable`, `not_checked`; `requestedRoundId`; optional `returnedRoundId`, `returnedPrice`, `returnedObservedAt`, `currentDecimals`, `error`. Numeric values are strings. |
| `context` | Decimal-string `chainId`, address strings `registry` and `oracle`. |

HCS verification statuses are `match`, `mismatch`, `unavailable`, `not_configured`, and `invalid`.
A successful HTTP response alone does not mean a receipt passed verification.
The anchor route can return a transaction ID with pending confirmation; inspect that transaction before deciding whether to submit again.

## Receipt JSON fields

The [strict parser and verifier](../packages/hardhat/utils/quoteReceipt.ts) accept exactly these 16 fields, all strings.
Unknown or missing fields fail parsing; numeric values use canonical non-negative decimal integer strings.
Addresses must be valid and nonzero. Hex hashes are 32 bytes.
The [historical fixture](../examples/receipt-testnet.json) supplies a complete example.

| Field | Type and meaning |
| --- | --- |
| `schemaVersion` | uint256 decimal; supported value `1`. |
| `chainId` | uint256 decimal; expected context is Hedera Testnet `296`. |
| `registry` | Address of the registry that issued the receipt. |
| `issuer` | Address of the `createQuote` caller. |
| `nonce` | uint256 decimal; issuer's record slot before increment. |
| `cents` | uint256 decimal; USD cents, 1–100,000,000. |
| `oracle` | Address of the Chainlink proxy. |
| `feedId` | bytes32 hex; `keccak256("HBAR/USD")`. |
| `roundId` | Positive uint80 decimal; exact proxy round. |
| `price` | Positive uint256 decimal; oracle answer scaled by `decimals`. |
| `decimals` | uint8 decimal, at most 18; configured feed uses 8. |
| `observedAt` | Positive uint256 decimal; oracle update time in Unix seconds. |
| `recordedAt` | Positive uint256 decimal; EVM block timestamp in Unix seconds. Must not precede `observedAt`. |
| `maximumAge` | uint256 decimal; frozen verifier policy is `93600` seconds. The observation's age at recording must fit this bound. |
| `tinybars` | uint256 decimal; ceiling of `cents × 10^(decimals + 6) / price`. |
| `commitment` | bytes32 hex; `keccak256(abi.encode(QuoteData))`, using the other 15 fields in table order. |

The transaction hash, log index, HCS topic and HCS sequence are outside this JSON schema.
See the [UI serializer and event model](../packages/nextjs/components/quoteproof/model.ts) and [HCS anchor model](../packages/nextjs/utils/quoteHcs.ts).

## verify:quote flags

Source: [verifyQuote.ts](../packages/hardhat/scripts/verifyQuote.ts).
Invoke from the repository root with `npm run verify:quote -w @sh/hardhat -- <flags>`.
File paths resolve from `packages/hardhat`; the [historical recipe](HOW-TO.md#inspect-the-historical-receipt) includes explicit context.

| Flag | Meaning and default |
| --- | --- |
| `--input <path>` | Required receipt JSON file. |
| `--expected-chain-id <decimal>` | Defaults to `296`, unless foreign context is allowed. |
| `--expected-registry <address>` | Trusted registry; otherwise loaded from the local Testnet deployment artifact. |
| `--expected-oracle <address>` | Trusted oracle; otherwise loaded from the local Testnet deployment artifact. |
| `--expected-commitment <bytes32>` | Expected receipt fingerprint; use with issuer and nonce. |
| `--expected-issuer <address>` | Expected sender; use with commitment and nonce for expected-quote comparison. |
| `--expected-nonce <decimal>` | Expected issuer slot; use with commitment and issuer. |
| `--compare-stored` | Adds direct read-only registry and historical oracle checks. Off by default. Requires trusted chain, registry and oracle context. |
| `--rpc-url <url>` | Comparison endpoint; overrides `HEDERA_RPC_URL`, then defaults to `https://testnet.hashio.io/api`. |
| `--allow-foreign-context` | Skips default context requirements. Explicit expectations still apply; this does not bypass schema, feed or arithmetic checks. |

Supply expected commitment, issuer and nonce together from an independent source.
Any partial expected-quote set is not checked and exits with failure.
The local result retains `onChainVerified: false`, even when optional comparison results are also printed.
Output adds `localConsistency`, `expectedQuote`, `historicalOracle` and `recordedComparison` to the [local verification result](../packages/hardhat/utils/quoteReceipt.ts).
Exit status is 2 for invalid input, failed expectations, or a requested on-chain comparison without both matches; successful verification exits 0.
No Next.js server is required.

## Contract functions and event

Source: [QuoteProofRegistry.sol](../packages/hardhat/contracts/QuoteProofRegistry.sol).
The constructor accepts `oracle_` (address), `expectedDecimals_` (uint8), and `maxAge_` (uint64).
It requires contract code at the oracle address, matching decimals ≤18, description `HBAR / USD`, and a nonzero age limit.
The [Testnet deployment](../packages/hardhat/deploy/03_deploy_quoteproof_registry.ts) sets 8 decimals and 93,600 seconds.

| Function | Behavior |
| --- | --- |
| `previewQuote(uint256 cents)` → nonce, roundId, price, decimals, observedAt, tinybars | View; checks amount and fresh observation; nonce belongs to `msg.sender`. |
| `createQuote(uint256 cents, uint80 expectedRound, uint256 expectedNonce)` → bytes32 | Writes commitment, increments caller nonce and emits the quote. Rejects a changed round or nonce. Does not transfer HBAR. |
| `getCommitment(address issuer, uint256 nonce)` → bytes32 | View; returns stored commitment, or zero for a missing slot. |
| `isStoredCommitment(address issuer, uint256 nonce, bytes32 commitment)` → bool | View; true only for an equal nonzero stored commitment. |
| `nonces(address)` → uint256 | Public mapping getter; next nonce for an issuer. |
| `oracle()`, `expectedDecimals()`, `maxAge()` | Public immutable getters: address, uint8, uint64. |
| `SCHEMA_VERSION()`, `MAX_CENTS()`, `MIN_CENTS()`, `MAX_ORACLE_DECIMALS()`, `FEED_ID()` | Public constant getters: 1, 100,000,000, 1, 18, and the HBAR/USD hash. |

`QuoteRecorded(bytes32 indexed commitment, QuoteData quote)` emits the commitment plus the 15-field tuple listed above.
The contract hashes that tuple and stores the hash under issuer and nonce.
Internal helpers compute the commitment, emit the event, read a fresh observation, and calculate ceiling tinybars; they are not callable ABI functions.
The freshness check rejects a zero round, nonpositive price, zero/future observation, changed decimals, or age above `maxAge`.
The deprecated `answeredInRound` and `startedAt` fields are not freshness conditions.

## Environment variables

This is the combined inventory of [Hardhat .env.example](../packages/hardhat/.env.example) and [Next.js .env.example](../packages/nextjs/.env.example).
All are optional for wallet-free preview and deterministic tests.
“Required” below means required for the named optional feature.
Public means the value is not a credential; it does not mean a server-only ID is exposed as a browser variable.

| Name | Package | Required or optional | Public or secret | What it enables | Safe default |
| --- | --- | --- | --- | --- | --- |
| `HEDERA_RPC_URL` | Hardhat | Optional | Public endpoint; keep credential-bearing URLs private | Hardhat provider and CLI read-only comparison | `https://testnet.hashio.io/api` |
| `DEPLOYER_PRIVATE_KEY_ENCRYPTED` | Hardhat | Required for credentialed deploy/quote wrappers | Secret encrypted account material | Interactive local signing after unlock | Unset; generate/import through account commands, never fill manually |
| `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID` | Next.js | Optional | Public | WalletConnect provider configuration | Unset; code supplies a starter project ID; unnecessary for read-only checks |
| `NEXT_PUBLIC_HEDERA_MAINNET_RPC_URL` | Next.js | Optional | Public; browser-visible | Mainnet wallet RPC transport | Unset; `https://mainnet.hashio.io/api` fallback |
| `NEXT_PUBLIC_HEDERA_TESTNET_RPC_URL` | Next.js | Optional | Public; browser-visible | Testnet wallet transport and quote API reads | Unset; `https://testnet.hashio.io/api` fallback |
| `HCS_OPERATOR_ID` | Next.js | Required for own-topic verification and anchoring | Public ID, server configuration | Expected message payer; account used for anchoring | Unset for historical verification; empty disables the historical fallback |
| `HCS_OPERATOR_KEY` | Next.js | Required for topic creation and anchoring | Secret | ECDSA signing and operator/submit-key checks | Unset; anchoring off |
| `HCS_TOPIC_ID` | Next.js | Required for own-topic verification and anchoring | Public ID, server configuration | Topic to submit to or verify | Unset for historical verification; empty disables the historical fallback |
| `HCS_ANCHOR_TOKEN` | Next.js | Required for anchoring | Secret | Bearer authorization for the anchor route | Unset; anchor requests rejected |

Sources: [Hardhat config](../packages/hardhat/hardhat.config.ts), [account import](../packages/hardhat/scripts/importAccount.ts), [CLI verifier](../packages/hardhat/scripts/verifyQuote.ts), [Scaffold config](../packages/nextjs/scaffold.config.ts), [HCS verify](../packages/nextjs/app/api/quote/hcs/verify/route.ts), [HCS anchor](../packages/nextjs/app/api/quote/hcs/anchor/route.ts).
The historical HCS fallback requires **both** public IDs to be absent from the environment.
Copying the empty HCS entries from `.env.example` makes them present as empty strings; remove those entries for the published historical receipt.
For your own topic, set both IDs and restart Next.js.

Other code-only controls are not entries in the example files: `HCS_ANCHOR_DISABLED=true` disables submissions after authorization/config checks in the anchor route.
The [account resolver](../packages/nextjs/app/api/hedera/account/route.ts) accepts `HEDERA_MIRROR_TESTNET_URL` and `HEDERA_MIRROR_MAINNET_URL`; these do not change the fixed HCS Mirror base in [quoteHcs.ts](../packages/nextjs/utils/quoteHcs.ts).

## File map

- [Registry contract](../packages/hardhat/contracts/QuoteProofRegistry.sol): bounds the quote and stores its commitment.
- [Receipt and commitment code](../packages/hardhat/utils/quoteReceipt.ts): parses receipts and recomputes their fingerprint.
- [Receipt comparison](../packages/hardhat/utils/quoteReceiptComparison.ts): compares issued, oracle and stored values.
- [Preview route](../packages/nextjs/app/api/quote/preview/route.ts): reads a wallet-free reference.
- [Compare route](../packages/nextjs/app/api/quote/compare/route.ts): runs the read-only receipt checks.
- [HCS verify route](../packages/nextjs/app/api/quote/hcs/verify/route.ts): reads a topic message through the Mirror Node.
- [HCS anchor route](../packages/nextjs/app/api/quote/hcs/anchor/route.ts): submits after confirming the recorded event.
- [Tamper demo](../scripts/demo.mjs): runs the genuine and altered receipt cases.

- [Standalone verifier](../packages/hardhat/scripts/verifyQuote.ts): local and optional RPC verification.
- [App composition](../packages/nextjs/components/QuoteProofExperience.tsx): preview, receipt and supporting sections.
- [Receipt UI](../packages/nextjs/components/quoteproof/): guarded write, event-bound receipt, share/export, forge controls and check cards.
- [Release evidence](release-evidence.md): revision-specific checks and hosted-preview provenance.
- [MIT license](../LICENSE): license and upstream notice.

## npm scripts

The tables below are transcribed from the three package manifests.
Root commands use `npm run <name>`; workspace commands use `npm run <name> -w <package> -- <arguments>`.
Account reveal prints private material. Deploy, quote creation and explorer verification commands are not part of the read-only walkthrough.
`next:start` and workspace `start` run development mode; use `next:serve` after a production build.

### Root

Source: [package.json](../package.json).

| Script | Expansion |
| --- | --- |
| `demo` | `node scripts/demo.mjs` |
| `demo:test` | `node --test scripts/demo.test.mjs` |
| `format` | `npm run next:format -- && npm run hardhat:format --` |
| `hardhat:account` | `npm run account -w @sh/hardhat --` |
| `hardhat:account:generate` | `npm run account:generate -w @sh/hardhat --` |
| `hardhat:account:import` | `npm run account:import -w @sh/hardhat --` |
| `hardhat:account:reveal-pk` | `npm run account:reveal-pk -w @sh/hardhat --` |
| `hardhat:chain` | `npm run chain -w @sh/hardhat --` |
| `hardhat:check-types` | `npm run check-types -w @sh/hardhat --` |
| `hardhat:clean` | `npm run clean -w @sh/hardhat --` |
| `hardhat:compile` | `npm run compile -w @sh/hardhat --` |
| `hardhat:deploy` | `npm run deploy -w @sh/hardhat --` |
| `hardhat:flatten` | `npm run flatten -w @sh/hardhat --` |
| `hardhat:fork` | `npm run fork -w @sh/hardhat --` |
| `hardhat:format` | `npm run format -w @sh/hardhat --` |
| `hardhat:lint` | `npm run lint -w @sh/hardhat --` |
| `hardhat:lint-staged` | `npm run lint-staged -w @sh/hardhat --` |
| `hardhat:test` | `npm run test -w @sh/hardhat --` |
| `hardhat:verify` | `npm run verify -w @sh/hardhat --` |
| `hardhat:verify:testnet` | `npm run verify:testnet -w @sh/hardhat --` |
| `hardhat:verify:mainnet` | `npm run verify:mainnet -w @sh/hardhat --` |
| `lint` | `npm run next:lint -- && npm run hardhat:lint --` |
| `next:build` | `npm run build -w @sh/nextjs --` |
| `next:check-types` | `npm run check-types -w @sh/nextjs --` |
| `next:dev` | `npm run dev -w @sh/nextjs --` |
| `next:format` | `npm run format -w @sh/nextjs --` |
| `next:lint` | `npm run lint -w @sh/nextjs --` |
| `next:serve` | `npm run serve -w @sh/nextjs --` |
| `next:start` | `npm run start -w @sh/nextjs --` |

### @sh/hardhat

Source: [packages/hardhat/package.json](../packages/hardhat/package.json).

| Script | Expansion |
| --- | --- |
| `account` | `hardhat run scripts/listAccount.ts` |
| `account:generate` | `hardhat run scripts/generateAccount.ts` |
| `account:import` | `hardhat run scripts/importAccount.ts` |
| `account:reveal-pk` | `hardhat run scripts/revealPK.ts` |
| `chain` | `node scripts/runHardhatWithEnv.cjs chain` |
| `check-types` | `tsc --noEmit --incremental` |
| `compile` | `hardhat compile` |
| `clean` | `hardhat clean` |
| `deploy` | `ts-node scripts/runHardhatDeployWithPK.ts` |
| `deploy:quote` | `npm run deploy -- --network hederaTestnet --tags QuoteProof` |
| `flatten` | `hardhat flatten` |
| `fork` | `node scripts/runHardhatWithEnv.cjs fork` |
| `format` | `prettier --write './**/*.(ts|sol)'` |
| `lint` | `eslint` |
| `lint-staged` | `eslint` |
| `test` | `node scripts/runHardhatWithEnv.cjs test` |
| `quote:create` | `ts-node scripts/runHardhatQuoteCreateWithPK.ts` |
| `quote:e2e` | `ts-node scripts/runHardhatQuoteE2EWithPK.ts` |
| `verify:quote` | `ts-node scripts/verifyQuote.ts` |
| `verify` | `hardhat verify` |
| `verify:testnet` | `hardhat verify --network hederaTestnet` |
| `verify:mainnet` | `hardhat verify --network hederaMainnet` |

### @sh/nextjs

Source: [packages/nextjs/package.json](../packages/nextjs/package.json).

| Script | Expansion |
| --- | --- |
| `build` | `next build` |
| `check-types` | `tsc --noEmit --incremental` |
| `dev` | `next dev` |
| `format` | `prettier --write . '!(node_modules|.next|contracts)/**/*'` |
| `lint` | `next lint` |
| `serve` | `next start` |
| `start` | `next dev` |

## Evidence and security

- [Adversarial evidence](adversarial-evidence.md): four cases, failure layers and independent expectations.
- [Release evidence](release-evidence.md): dated revision and hosted-preview provenance.
- [Security](security.md): dated dependency audit, affected paths and reproduction command.
