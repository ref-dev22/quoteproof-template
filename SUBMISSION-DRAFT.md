# QuoteProof reviewer evidence

QuoteProof is a Scaffold-HBAR template for Chainlink-priced USD-to-HBAR reference quotes on Hedera Testnet. Its Solidity registry validates a bounded oracle observation, computes the quantity in tinybars, and records a commitment. A recipient can export a receipt and independently check its arithmetic, the exact historical oracle round, and the stored registry commitment. It does not transfer HBAR or establish that an invoice was paid.

## Start from the public template

Repository: https://github.com/ref-dev22/quoteproof-template

```bash
npx create-scaffold-hbar@latest quoteproof --template ref-dev22/quoteproof-template#main --frontend nextjs-app --solidity-framework hardhat --network testnet --package-manager "npm" --ci --skip-hedera-skills --skip-install
cd quoteproof
npm ci
npm run hardhat:test
npm run next:dev -- --hostname 0.0.0.0 --port 3001
```

The source repository has the required `template.json`; the CLI removes it from the generated project after using it. The preview needs no wallet. A testnet deployment and write are separate credentialed steps described in [README.md](README.md).

## Inspect the proof without a new transaction

- [Live app](https://quoteproof.vercel.app/) and [118-second captioned walkthrough](https://quoteproof.vercel.app/demo/index.html).
- [Historical receipt in the app](https://quoteproof.vercel.app/?tx=0x076690438e81f96fc77f3f6467157d2f53c05703ef098790a42b82909a340ef9). Use **Compare stored commitment** to see local `valid`, historical oracle `match`, and recorded commitment `match` as separate results.
- [Transaction on HashScan](https://hashscan.io/testnet/transaction/0x076690438e81f96fc77f3f6467157d2f53c05703ef098790a42b82909a340ef9) and [Mirror Node result](https://testnet.mirrornode.hedera.com/api/v1/contracts/results/0x076690438e81f96fc77f3f6467157d2f53c05703ef098790a42b82909a340ef9) (`SUCCESS`). Chain ID `296`, contract ID `0.0.10645852`, reference registry `0xa1a741aF6e0A45164e2Af6A1C35dC30275629709`.
- [Four-case adversarial matrix](docs/adversarial-evidence.md) and [committed receipt](examples/receipt-testnet.json). The standalone verifier can run locally with explicit chain, registry, and oracle arguments; the README gives the exact command. A correctly recomputed fabricated receipt can pass local math yet fail the stored-record check.

## Reproducible release evidence

The public `3092716` source/docs checkpoint passed [CI](https://github.com/ref-dev22/quoteproof-template/actions/runs/35832893645) and an [empty-directory external scaffold](https://github.com/ref-dev22/quoteproof-template/actions/runs/35832913537) on Node 20.18.3 with CLI 0.4.0. The latter performed source-provenance comparisons, `npm ci`, compile, 34 tests, type checks, zero-warning lint, production build/start and six HTTP/API checks. The hosted app/video implementation baseline `985f15f` separately passed [CI](https://github.com/ref-dev22/quoteproof-template/actions/runs/35732415654) and its [external scaffold gate](https://github.com/ref-dev22/quoteproof-template/actions/runs/35732484059). Each run proves only the commit named by its GitHub metadata; check the latest revision's workflow results before treating it as verified.

The contract, verifier, API routes, UI, and tests are in `packages/`. The generated `deployedContracts.ts` supplies the registry address to Scaffold hooks and QuoteProof's preview, receipt UI, and comparison route after a new testnet deployment. The HBAR/USD testnet oracle remains pinned and validated by the deploy script. The historical example belongs to the published reference registry.

## Boundaries

A QuoteProof receipt is evidence of a recorded reference quote, not settlement, invoice identity, objective market truth, or a currently payable price. Local arithmetic alone is not on-chain verification. Mirror/HashScan links support the historical testnet proof; the read-only app comparison uses Hedera JSON-RPC for registry/oracle reads. No HCS, HTS or scheduled transaction is claimed. The project uses a Solidity contract on Hedera and retains its MIT upstream notices in [LICENCE](LICENCE). [AGENTS.md](AGENTS.md) documents AI-assisted use of the template.
