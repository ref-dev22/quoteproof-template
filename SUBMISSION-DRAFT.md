# QuoteProof submission draft

This is a preparation artifact only. It does not publish the repository or submit the competition entry.

## Proposed public repository

- Repository: `https://github.com/ref-dev22/quoteproof-template`
- Default branch: `main`
- Candidate revision: `7399e52`
- External scaffold command after publication:

  ```bash
  npx create-scaffold-hbar@latest quoteproof --template ref-dev22/quoteproof-template#main --frontend nextjs-app --solidity-framework hardhat --network testnet --package-manager npm --ci --skip-hedera-skills
  ```

## Eligibility and proof packet

- [ ] Owner authorizes the repository publication and confirms the target owner/repository.
- [ ] Push the clean candidate revision; preserve the exact commit hash.
- [ ] Run the external-template command from an empty directory.
- [ ] Run install, Hardhat tests, compile, frontend type-check/lint, production build, and app boot from the generated project.
- [ ] Confirm `GET /api/quote/preview?cents=100` returns HTTP 200 with all six decimal-string fields.
- [ ] Add the final remote scaffold log and URL to the private evidence packet.
- [ ] Recheck the official contest self-check, terms, payout and submission form when published.
- [ ] Submit only after the owner reviews the completed packet and explicitly authorizes submission.

## Current verified evidence

- Genuine Hedera Testnet deployment and `QuoteRecorded` transaction are recorded privately.
- Wallet-free browser preview, receipt-link recovery, and visible stale/changed-round/altered-receipt exercises are recorded privately.
- Read-only comparison now demonstrates genuine local/historical-oracle/stored `valid/match/match`, simple-tamper `invalid/not_checked/not_run`, recomputed amount forgery `valid/match/mismatch`, false-price forgery with historical/stored mismatches, missing-record `not_found`, wrong-context rejection, wrong-network guarding, and provider failure without another write.
- Public local clean-room install/build/boot passes at `0dbe33a`; the current working candidate additionally passes 36 Hardhat tests, zero-warning Hardhat/frontend lint, type-check, production build, route-guard regressions, true 375/320px mobile DOM checks, the narrow-layout fix, and the local endpoint adversarial checks in this checkout.
- The public CI workflow is deterministic (`npm ci`, compile, tests, types, lint, build) and does not deploy contracts or require wallet/private secrets. `AGENTS.md` and `DEMO-SCRIPT.md` describe the actual QuoteProof paths and the API-only forged-copy demonstration.
- The manifest is local and validated against the current official CLI schema; the remote command remains unrun because the repository is not published.

## Honest remaining gates

- Remote repository publication and external CLI scaffold run.
- Full independent README run (the newcomer review was read-only and did not satisfy D6).
- The mocked wallet guard matrix is complete; real wallet rejection, wrong-network, pending, and duplicate-click interaction remains intentionally unclaimed because no live signing or additional wallet harness was authorized.
- Official organizer terms and final submission authorization.
