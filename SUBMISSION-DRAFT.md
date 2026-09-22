# QuoteProof submission draft

This tracks the owner-authorized publication preparation. It does not claim that the repository has been published or that the competition entry has been submitted.

## Authorized publication target

- Repository: `https://github.com/ref-dev22/quoteproof-template`
- Default branch: `main`
- Candidate revision: update to the final publication commit after local checks
- External scaffold command after publication:

  ```bash
  npx create-scaffold-hbar@latest quoteproof --template ref-dev22/quoteproof-template#main --frontend nextjs-app --solidity-framework hardhat --network testnet --package-manager npm --ci --skip-hedera-skills
  ```

## Eligibility and proof packet

- [x] Owner authorizes publication of the target owner/repository.
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
- The direct `verify:quote --compare-stored` path performs the same registry/oracle reads without the Next.js server. The independent expected-quote check requires separately supplied commitment/issuer/nonce and reports `not_supplied`, `not_checked`, `match`, or `mismatch`; two genuine fixtures are independently authentic but a different quote is rejected for the expected quote.
- Public local clean-room install/build/boot passes at `0dbe33a`; the current working candidate additionally passes 38 Hardhat tests, zero-warning Hardhat/frontend lint, type-check, production build, route-guard regressions, true 375/320px mobile DOM checks, the narrow-layout fix, direct CLI read-only verification, and the local endpoint adversarial checks in this checkout.
- The public CI workflow is deterministic (`npm ci`, compile, tests, types, lint, build) and does not deploy contracts or require wallet/private secrets. `AGENTS.md` and `DEMO-SCRIPT.md` describe the actual QuoteProof paths and the API-only forged-copy demonstration.
- A bounded independent README walkthrough used an exact local-source export of `5ee3a5f` as an explicitly documented pre-publication substitution for the unavailable remote repository. It confirmed Node `v24.18.0`/npm `11.6.2`, no-secret prerequisites, and `npm ci` exit `0`; the same clean copy passed 37 Hardhat tests, compile, Hardhat/frontend types and lint, production build, production boot on port `3002`, `GET /` 200, preview 200 with all six decimal-string fields, and compare 200 with local/historical/stored `valid/match/match`. The first cold `next dev` route compile exceeded its bounded probe, so that dev cold-start behavior is not claimed; production release boot/routes passed. This local-source result is not the literal remote scaffold gate. The follow-up source revision `150eece` was then exported without `.git` or ignored deployment artifacts; after `npm ci --offline --ignore-scripts`, the documented explicit-context `verify:quote --compare-stored` command passed with exit code `0`, `valid`, historical `match`, and stored `match`.
- The manifest is local and validated against the current official CLI schema; the remote command remains unrun because the repository is not published.

## Honest remaining gates

- Remote repository publication and external CLI scaffold run.
- Run the literal remote scaffold test after publication; the local-source D6 substitution does not satisfy that separate mandatory gate.
- Correctness follow-ups from `150eece` remain covered: when `--compare-stored` is requested, the CLI exits non-zero for every stored or historical status other than `match`, while an absent optional expected quote remains non-fatal; deterministic negative-path coverage is included in the Hardhat suite. Root and package verifier examples provide explicit chain, registry, and oracle context (and label `--allow-foreign-context` as offline-only), so the documented fresh-source command does not depend on ignored deployment artifacts. The authorized publication revision also disables accidental forked/gas-reporting tests, removes unused starter token scaffolding, and guards the preview RPC with bounded input, chain, timeout, and response handling.
- The mocked wallet guard matrix is complete; real wallet rejection, wrong-network, pending, and duplicate-click interaction remains intentionally unclaimed because no live signing or additional wallet harness was authorized.
- Official organizer terms and final submission authorization.
