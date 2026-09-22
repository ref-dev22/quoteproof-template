# Adversarial receipt evidence

This packet records a read-only standalone verifier run against the public Hedera Testnet context. It uses four inspectable JSON fixtures and keeps the checks separate:

| Fixture | Mutation | Exit | Local | Historical round | Stored commitment |
| --- | --- | ---: | --- | --- | --- |
| [`genuine.json`](../examples/adversarial/genuine.json) | exported receipt | `0` | `valid` | `match` | `match` |
| [`simple-tamper-tinybars-plus-one.json`](../examples/adversarial/simple-tamper-tinybars-plus-one.json) | tinybars plus one, commitment unchanged | `2` | `invalid` | `not_checked` | `not_run` |
| [`recomputed-cents-1000.json`](../examples/adversarial/recomputed-cents-1000.json) | cents `100 → 1000`, amount and commitment recomputed | `2` | `valid` | `match` | `mismatch` |
| [`recomputed-double-price.json`](../examples/adversarial/recomputed-double-price.json) | price doubled, amount and commitment recomputed | `2` | `valid` | `mismatch` | `mismatch` |

The four results are summarized in [`adversarial-results.json`](../evidence/HED-final-demo-20260922/adversarial-results.json) and the readable static report is [`verification-report.html`](../evidence/HED-final-demo-20260922/verification-report.html). The genuine downloaded receipt was semantically equal to the repository's historical public fixture before these cases ran. The report is recorded evidence, not a live UI claim or proof of payment, current price, identity, or settlement.

Run one case from the repository root with Node.js `>=20.18.3`:

```bash
npm ci
npm run verify:quote -w @sh/hardhat -- --input ../../examples/adversarial/genuine.json --expected-chain-id 296 --expected-registry 0xa1a741aF6e0A45164e2Af6A1C35dC30275629709 --expected-oracle 0x59bC155EB6c6C415fE43255aF66EcF0523c92B4a --compare-stored --rpc-url https://testnet.hashio.io/api
```

Replace the input path with any of the other three fixtures. A negative case intentionally exits `2`; inspect its JSON output rather than treating that exit as a harness failure. These commands perform read-only RPC calls and do not require a wallet, key, deployment, or new transaction.

The configured registry stores the genuine commitment for the historical receipt. Therefore a consistently recomputed copy can be locally calculation-valid while still disagreeing with recorded state. The false-price case also disagrees with the exact historical oracle round. A one-field tamper fails local arithmetic and commitment checks before remote comparisons run.

The public report does not include raw terminal logs, screenshots, browser metadata, local filesystem paths, credentials, or contact information.
