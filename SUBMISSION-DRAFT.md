# QuoteProof submission draft

The repository is public. The competition entry has not been submitted. This file records verified release evidence and outstanding submission checks.

## Public repository and scaffold

- Repository: https://github.com/ref-dev22/quoteproof-template
- Default branch: `main`
- Validated implementation revision: `8b6a564`; subsequent documentation-only changes are tracked in Git.

```bash
npx create-scaffold-hbar@latest quoteproof --template ref-dev22/quoteproof-template#main --frontend nextjs-app --solidity-framework hardhat --network testnet --package-manager "npm" --ci --skip-hedera-skills --skip-install
cd quoteproof
npm ci
```

The explicit skip-install path separates remote template generation from the lockfile install. CLI 0.4.0 successfully generated the public template from an empty directory. It intentionally removes `template.json` from the generated project; the source repository retains the manifest.

## Verified evidence

- [x] Public repository published with owner authorization.
- [x] External CLI scaffold from the public repository completed successfully using the scaffold command above.
- [x] Linux CI on Node 20.18.3 passed clean install, contract compile, all 34 tests, both TypeScript checks, both zero-warning lint checks and the production build. [Implementation CI run](https://github.com/ref-dev22/quoteproof-template/actions/runs/35693123326).
- [x] Genuine Hedera Testnet deployment and successful `QuoteRecorded` transaction, independently rechecked through Mirror Node on 22 September 2026.
- [x] Contract, receipt, historical-oracle comparison, stored-commitment comparison and route-guard tests. Default tests use local mocks and do not deploy or require credentials.

The current test count removes unused starter-token tests and includes five preview-route guard tests. Earlier local-source clean-room and browser checks covered previous revisions; they are not presented as a completed release check of the current remote-generated copy.

## Public testnet evidence

- Chain ID: `296`
- Registry: `0xa1a741aF6e0A45164e2Af6A1C35dC30275629709`
- Chainlink oracle: `0x59bC155EB6c6C415fE43255aF66EcF0523c92B4a`
- Contract ID: `0.0.10645852`
- [Recorded transaction on HashScan](https://hashscan.io/testnet/transaction/0x076690438e81f96fc77f3f6467157d2f53c05703ef098790a42b82909a340ef9)
- [Public Mirror Node contract result](https://testnet.mirrornode.hedera.com/api/v1/contracts/results/0x076690438e81f96fc77f3f6467157d2f53c05703ef098790a42b82909a340ef9)

Verification distinguishes local consistency, agreement with the exact historical Chainlink round, and agreement with the registry's stored commitment. The standalone CLI also supports an independently supplied expected issuer, nonce and commitment together. A reference quote is not proof of payment, an invoice binding or a currently payable price.

## Outstanding release and submission checks

- [ ] Complete install, tests, types, lint and production build in the current remote-generated Windows copy. An earlier attempt failed with local disk exhaustion; Linux CI passed separately.
- [ ] Boot that generated copy and check homepage, live preview, genuine receipt comparison and altered-receipt rejection through the API and browser.
- [ ] Confirm final documentation survives the external CLI's Markdown transformation.
- [ ] Complete the demo and final submission packet against the organizer's current requirements; locate and run the organizer self-check if available.
- [ ] Review official terms and payout requirements, then obtain final competition-submission authorization.

No additional live wallet interaction, signing, deployment or payment is claimed by these read-only release checks. The template currently uses a Solidity registry on Hedera and Chainlink; it does not implement HCS, HSS, HTS, settlement or quote expiry.
