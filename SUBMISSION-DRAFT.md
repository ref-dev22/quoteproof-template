# QuoteProof submission draft

The repository is public. The competition entry has not been submitted. This file records verified release evidence and outstanding submission checks.

## Public repository and scaffold

- Repository: https://github.com/ref-dev22/quoteproof-template
- Default branch: `main`
- Deployed and validated app/demo baseline: `985f15f42a7d4cfde2fee82523f2cfcb97b5d438`. Later documentation-only commits should not be read as covered by the pinned runs below.
- Public demo: https://quoteproof.vercel.app

```bash
npx create-scaffold-hbar@latest quoteproof --template ref-dev22/quoteproof-template#main --frontend nextjs-app --solidity-framework hardhat --network testnet --package-manager "npm" --ci --skip-hedera-skills --skip-install
cd quoteproof
npm ci
```

The explicit skip-install path separates remote template generation from the lockfile install. CLI 0.4.0 successfully generated the public template from an empty directory. It intentionally removes `template.json` from the generated project; the source repository retains the manifest.

## Provenance of the evidence

- Runtime app/demo baseline: deployed revision `985f15f42a7d4cfde2fee82523f2cfcb97b5d438`.
- CI baseline: [run 35732415654](https://github.com/ref-dev22/quoteproof-template/actions/runs/35732415654) passed install, compile, 34 tests, types, lint and build.
- External scaffold baseline: [run 35732484059](https://github.com/ref-dev22/quoteproof-template/actions/runs/35732484059) passed the empty-directory CLI scaffold, install, source checks and runtime/API checks.
- These runs verify the `985f15f` app/demo baseline; subsequent documentation-only commits are separate evidence.

## Organizer form status

The draft is not submitted, and organizer acceptance is unknown. The current form requires a public video URL under five minutes, a project description of no more than three sentences, a mainnet payout account ID, and five developer-experience ratings. The [recorded walkthrough](https://quoteproof.vercel.app/demo/index.html) is live; the mainnet payout ID and survey draft are prepared privately pending the owner's final approval and submission.

Proposed three-sentence project description:

> QuoteProof is a reusable Scaffold-HBAR template for Chainlink-priced USD-to-HBAR reference quotes with wallet-free receipt verification. A Solidity registry on Hedera Testnet validates the oracle observation, computes the amount with integer rounding and stores a commitment binding the recorded quote, while recipients independently compare the receipt's calculation, exact historical Chainlink round and stored registry commitment. Its exported receipts, standalone verifier, adversarial examples and tested policy-adaptation guide demonstrate why even a fabricated receipt with correct arithmetic and a genuine historical price fails the recorded-proof check; it does not settle payments or guarantee a currently payable price.

## Verified evidence

- [x] Public repository published with owner authorization.
- [x] External CLI scaffold from the public repository completed successfully using the scaffold command above.
- [x] Linux CI evidence on Node 20.18.3 for baseline `985f15f` covered clean install, contract compile, all 34 tests, both TypeScript checks, both zero-warning lint checks and the production build; see [run 35732415654](https://github.com/ref-dev22/quoteproof-template/actions/runs/35732415654).
- [x] Genuine Hedera Testnet deployment and successful `QuoteRecorded` transaction, independently rechecked through Mirror Node on 22 September 2026.
- [x] Contract, receipt, historical-oracle comparison, stored-commitment comparison and route-guard tests. Default tests use local mocks and do not deploy or require credentials.
- [x] External-scaffold release evidence for baseline `985f15f` on Node 20.18.3/Linux covered public CLI download, source checks, clean install, all 34 tests, types, lint, production build/startup and runtime/API checks; see [run 35732484059](https://github.com/ref-dev22/quoteproof-template/actions/runs/35732484059) and [CI run 35732415654](https://github.com/ref-dev22/quoteproof-template/actions/runs/35732415654).
- [x] Six read-only runtime checks passed on the generated app: homepage 200; live preview 200 with six string fields; invalid zero and oversized amounts 400; genuine receipt `valid/match/match`; altered receipt `invalid/not_checked/not_run`.
- [x] Generated README commands were checked after CLI transformation; the manifest's optional deployment instruction forwards its arguments correctly.
- [x] Sanitized four-case standalone evidence packet is published with inspectable fixtures, result matrix and a readable report; the genuine export semantically matches the public historical fixture.

The current test count removes unused starter-token tests and includes five preview-route guard tests. The passing release run preserves the source reference, CLI output, install/static/build logs and runtime results as an artifact. It performs no signing or deployment.

The public Vercel deployment separately passed its remote build and all six unauthenticated HTTP/API checks. Browser testing loaded the historical receipt and displayed all three comparison matches; desktop screenshots were captured on the deployed implementation. A measured 22 September 2026 Playwright 1.62.1 / Chromium 1234 HTTPS run downloaded the actual Export receipt JSON successfully at 615 bytes, semantically matched `examples/receipt-testnet.json`, and produced standalone CLI `valid/match/match` with exit code `0`; a copied receipt with a one-tinybar change produced `invalid` with exit code `2`. The earlier agent-browser cancellation root cause remains unresolved. No physical-device or live-wallet interaction test is claimed.

## Public testnet evidence

- Chain ID: `296`
- Registry: `0xa1a741aF6e0A45164e2Af6A1C35dC30275629709`
- Chainlink oracle: `0x59bC155EB6c6C415fE43255aF66EcF0523c92B4a`
- Contract ID: `0.0.10645852`
- [Recorded transaction on HashScan](https://hashscan.io/testnet/transaction/0x076690438e81f96fc77f3f6467157d2f53c05703ef098790a42b82909a340ef9)
- [Public Mirror Node contract result](https://testnet.mirrornode.hedera.com/api/v1/contracts/results/0x076690438e81f96fc77f3f6467157d2f53c05703ef098790a42b82909a340ef9)

Verification distinguishes local consistency, agreement with the exact historical Chainlink round, and agreement with the registry's stored commitment. The standalone CLI also supports an independently supplied expected issuer, nonce and commitment together. A reference quote is not proof of payment, an invoice binding or a currently payable price.

## Outstanding release and submission checks

- [ ] Complete the final submission review; receipt-download validation, desktop/browser comparison and hosted API checks are complete. Local Windows install/build validation was curtailed by disk and memory pressure; the complete generated-project gate passed on Linux.
- [ ] Obtain owner final approval and provide the hosted 118.320-second recording URL in the organizer form; the public viewer path is `/demo/index.html`.
- [ ] Enter the privately prepared mainnet payout account ID and five developer-experience ratings after owner approval; these fields are intentionally absent from the public repository.
- [ ] Finalize the submission packet against the organizer's current requirements; locate and run the organizer self-check if available.
- [ ] Review official terms and payout requirements, then obtain final competition-submission authorization.

No additional live wallet interaction, signing, deployment or payment is claimed by these read-only release checks. The template currently uses a Solidity registry on Hedera and Chainlink; it does not implement HCS, HSS, HTS, settlement or quote expiry.
