# Hardhat package (Hedera)

Hardhat config, contracts, deploy scripts, tests, and Hashscan verification for this monorepo.

## Local development

From the repo root, use the explicit `hardhat:*` scripts for this package. Inside `packages/hardhat`, use the unprefixed package-local scripts.

1. **Start the local chain** (terminal 1, from repo root):
   ```bash
   npm run hardhat:chain
   ```
   This starts `hardhat node` with **Hedera testnet forking** (`HEDERA_FORKING=true` and `@hashgraph/system-contracts-forking`). JSON-RPC is served at **http://127.0.0.1:8545**.

2. **Deploy to the running fork** (terminal 2):
   ```bash
   npm run hardhat:deploy --network localhost
   ```
   Use **`localhost`** so Hardhat connects to the long-running node on port 8545.

   **`npm run hardhat:deploy` without `--network localhost`** uses the default network `hardhat`, which is the **in-process ephemeral** Hardhat network—**not** the same process as `npm run hardhat:chain`. For deploys against the forked node you started in step 1, always pass **`--network localhost`** while that node is running.

3. **Run contract tests** (from repo root; tests use `HEDERA_FORKING=true` and can run against the fork or standalone):
   ```bash
   npm run hardhat:test
   ```

## Deploy and verify on Hedera testnet/mainnet

You need a deployer account with HBAR on the target network. Without funds, deploy and verify will fail with "Sender account not found".

1. **Generate or import an account** (from the repo root):
   ```bash
   npm run hardhat:account:generate
   ```
   or
   ```bash
   npm run hardhat:account:import
   ```
   The encrypted key is stored in `packages/hardhat/.env`.

2. **Fund the account on testnet:**  
   Use the [Hedera Portal faucet](https://portal.hedera.com/faucet) to receive testnet HBAR.

3. **Deploy to Hedera testnet** (from repo root):
   ```bash
   npm run hardhat:deploy --network hederaTestnet
   ```
   or
   ```bash
   npm run hardhat:deploy --network hedera_testnet
   ```
   You will be prompted to enter the password to decrypt your deployer key.

4. **Verify on Hashscan** (uses deployment JSON under `deployments/<network>/`, which includes compiler metadata and sources):
   ```bash
   npm run hardhat:verify:testnet   # all contracts on chain 296
   npm run hardhat:verify:mainnet   # all contracts on chain 295
   npm run verify:contract -w @sh/hardhat -- -- HederaToken testnet
   npm run verify:contract -w @sh/hardhat -- -- HederaToken testnet 0xYourContractAddress
   ```

## QuoteProof receipts

The testnet-only QuoteProof path deploys the registry and creates one receipt with a single local password unlock:

```bash
npm run quote:e2e -- --network hederaTestnet --cents 100 --output ./quoteproof-receipt.json
```

The creator rebuilds the receipt from the confirmed `QuoteRecorded` event and refuses to write it unless the event, stored commitment and standalone verifier agree. Verify a receipt with the deployed context bound explicitly:

```bash
npm run verify:quote -- --input ./quoteproof-receipt.json \
  --expected-chain-id 296 \
  --expected-registry 0xDeployedQuoteProofRegistry \
  --expected-oracle 0x59bC155EB6c6C415fE43255aF66EcF0523c92B4a \
  --expected-issuer 0xReceiptIssuer
```

Without `--allow-foreign-context`, the verifier defaults to Hedera testnet chain `296` and loads the `deployments/hederaTestnet/QuoteProofRegistry.json` context when registry/oracle flags are omitted. `--allow-foreign-context` is only for deliberate offline fixtures. The result always reports `onChainVerified: false`; the standalone command checks schema, context bindings supplied to it, arithmetic and commitment, but does not query an RPC or explorer.

## Layout

- `contracts/` — Solidity sources
- `deploy/` — hardhat-deploy scripts (e.g. `00_deploy_hedera_token.ts`)
- `scripts/` — generateAccount, importAccount, verifyHedera.js, etc.
- `test/` — contract tests
- `hardhat.config.ts` — networks (`hardhat`, `localhost` for RPC at 127.0.0.1:8545, `hederaTestnet`, `hederaMainnet`)

Network and RPC URLs are in `hardhat.config.ts`. Deployer key is read from `.env` (encrypted) and decrypted at deploy time for live networks.
