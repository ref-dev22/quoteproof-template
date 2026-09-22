# Hardhat package (Hedera)

Contracts, local mock tests, deployment tooling, and standalone receipt verification for QuoteProof. Use the root README for the full scaffold and browser walkthrough.

From the repository root:

```bash
npm run hardhat:compile
npm run hardhat:test
npm run hardhat:check-types
npm run hardhat:lint
```

Tests run on the local Hardhat network with forking and gas reporting disabled. Live Hedera access and an account key are unnecessary for these tests. The optional `hardhat:chain` command starts a live-read testnet fork; it is separate from the default test path.

## QuoteProof receipts

The testnet-only QuoteProof path deploys the registry and creates one receipt with a single local password unlock:

```bash
npm run quote:e2e -- --network hederaTestnet --cents 100 --output ./quoteproof-receipt.json
```

The creator rebuilds the receipt from the confirmed `QuoteRecorded` event and refuses to write it unless the event, stored commitment and standalone verifier agree. Verify a receipt with the deployed context bound explicitly:

```bash
npm run verify:quote -- --input ./quoteproof-receipt.json --expected-chain-id 296 --expected-registry 0xa1a741aF6e0A45164e2Af6A1C35dC30275629709 --expected-oracle 0x59bC155EB6c6C415fE43255aF66EcF0523c92B4a --compare-stored --rpc-url https://testnet.hashio.io/api
```

Without `--allow-foreign-context`, the verifier defaults to Hedera testnet chain `296`; it may load `deployments/hederaTestnet/QuoteProofRegistry.json` when that ignored local artifact exists, but fresh source exports must use the explicit registry/oracle flags shown above. `--allow-foreign-context` is only for deliberate offline fixtures. The result always reports `onChainVerified: false`; `--compare-stored` adds direct read-only registry and historical-oracle calls without the Next.js server. The optional `--expected-commitment`, `--expected-issuer`, and `--expected-nonce` fields must come from an independent reference and report `not_supplied`, `not_checked`, `match`, or `mismatch`.

## Layout

- `contracts/` — Solidity sources
- `deploy/` — hardhat-deploy scripts (including `03_deploy_quoteproof_registry.ts`)
- `scripts/` — generateAccount, importAccount, verifyHedera.js, etc.
- `test/` — contract tests
- `hardhat.config.ts` — networks (`hardhat`, `localhost` for RPC at 127.0.0.1:8545, `hederaTestnet`, `hederaMainnet`)

Network and RPC URLs are in `hardhat.config.ts`. Deployer key is read from `.env` (encrypted) and decrypted at deploy time for live networks.
