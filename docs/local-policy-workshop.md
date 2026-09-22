# Local policy workshop (mock only)

This workshop shows how a developer can adapt the receipt freshness policy in a disposable local checkout. It uses the existing `MockQuoteProofAggregator` and the existing Hardhat, verifier, and API tests. It does not change the public deployment, the receipt schema, the live testnet receipt, or the wallet write path.

The published demo policy remains `93,600` seconds. The workshop uses `3,600` seconds as a deliberately local example. A shorter policy changes what a locally deployed registry accepts; it does not make the historical testnet receipt compatible with that policy.

## Run the workshop

Start from a clean clone or a temporary copy. The runner prints the committed source SHA and refuses a dirty worktree so it cannot silently validate a different uncommitted source. The commands below use the repository root:

```bash
npm ci
node scripts/check-local-policy-workshop.mjs
```

The checked-in [`local-policy-3600.patch`](local-policy-3600.patch) is the inspectable adaptation. It changes exactly four local verifier/test values:

1. `packages/hardhat/utils/quoteReceipt.ts` changes the verifier's expected policy to `3_600n`.
2. `packages/hardhat/test/QuoteProofRegistry.test.ts` deploys the mock registry with `3_600n`.
3. `packages/hardhat/test/quoteReceipt.test.ts` gives its offline fixture a `"3600"` maximum age.
4. `packages/hardhat/test/quoteCompareRoute.test.ts` gives its mocked API fixture a `"3600"` maximum age.

The workshop runner first leaves the verifier at `93,600` and probes it with an otherwise-consistent synthetic `3,600`-second receipt whose commitment is recomputed by the production helper. It requires `valid: false` and exactly the `maximumAge does not match the frozen policy` error. It then starts again from the clean checkout, applies the complete patch, and runs the existing Hardhat suite. This demonstrates why the policy and its local fixtures must move together without adding a second test implementation.

To apply the same change manually in a disposable copy:

```bash
git apply --check docs/local-policy-3600.patch
git apply docs/local-policy-3600.patch
npm run hardhat:test
npm run hardhat:check-types
```

To undo only this workshop patch, still in the disposable copy:

```bash
git apply --reverse --check docs/local-policy-3600.patch
git apply --reverse docs/local-policy-3600.patch
```

The workshop runner leaves the source checkout untouched and deletes only its own temporary clone after each run.

Do not use the live `examples/receipt-testnet.json` as the positive fixture after applying this patch: it intentionally records the deployed `93,600`-second policy and should be rejected by the adapted verifier. Do not change `packages/hardhat/deploy/03_deploy_quoteproof_registry.ts`, the example receipt, the Solidity schema, or any deployed address for this workshop.

If a real deployment needs a different freshness policy, that is a separate release: update the deployment source and verifier together, deploy with authorized local credentials, create a new receipt, and rerun provenance and hosted checks. The workshop does not perform any of those actions.

The normal Next.js preview remains a wallet-free RPC read and can report the reference as unavailable when its configured provider is unreachable. The optional `hardhat:chain` command is a forked read environment for explicit local experiments; it is not a complete local app mode and is not needed for this workshop. Deterministic proof of the adaptation comes from the mock contract, standalone verifier, and mocked comparison route tests.
