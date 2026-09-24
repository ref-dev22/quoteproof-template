# Release evidence and provenance

This page records historical checks for specific QuoteProof revisions. It does not imply that a later commit, hosted app, or organizer submission passed the same checks. Run the commands in the [README](../README.md) and inspect the current [main CI](https://github.com/ref-dev22/quoteproof-template/actions?query=branch%3Amain) for a newer release.

| Revision or surface | Recorded check and scope |
| --- | --- |
| Public merge `e9b3649130f416ee93f50e26ac4298589d5ccc57` | [PR #1](https://github.com/ref-dev22/quoteproof-template/pull/1) merged the reviewed implementation. Pin this SHA only when reproducing that merge revision. |
| Implementation/navigation `f253f1a` | [CI](https://github.com/ref-dev22/quoteproof-template/actions/runs/35898448985) and [external scaffold/install/build/runtime gate](https://github.com/ref-dev22/quoteproof-template/actions/runs/35898464171) passed, including 38 deterministic tests. These results belong to this revision. |
| Public baseline `1e21e3920088744888dd8e7c27b17ed0cbe5a3c1` | [CI](https://github.com/ref-dev22/quoteproof-template/actions/runs/35900945833) and [external gate](https://github.com/ref-dev22/quoteproof-template/actions/runs/35900975566) passed for the later documentation/video baseline. |
| [Isolated judge preview](https://quoteproof-judge-preview.vercel.app/?tx=0x076690438e81f96fc77f3f6467157d2f53c05703ef098790a42b82909a340ef9) | Separate from the original production app. Its historical read-only receipt journey and silent 99.44-second recording were checked for the `1e21e39` baseline. A new deployment must be checked separately. |
| [Original production app](https://quoteproof.vercel.app) | Older `985f15f` baseline and 118.320-second recording; its [CI](https://github.com/ref-dev22/quoteproof-template/actions/runs/35732415654) and [external gate](https://github.com/ref-dev22/quoteproof-template/actions/runs/35732484059) are historical. |

The [historical transaction](https://hashscan.io/testnet/tx/0x076690438e81f96fc77f3f6467157d2f53c05703ef098790a42b82909a340ef9) belongs to the published Testnet registry. [Mirror Node](https://testnet.mirrornode.hedera.com/api/v1/contracts/results/0x076690438e81f96fc77f3f6467157d2f53c05703ef098790a42b82909a340ef9) reported `SUCCESS`. It is evidence of a recorded reference quote, not a new transaction created by a documentation release or proof of payment.

The four read-only verifier cases are documented with inspectable public fixtures in [adversarial evidence](adversarial-evidence.md). A genuine receipt gave local `valid`, historical oracle `match`, and stored commitment `match`; the recomputed amount and false-price cases demonstrate distinct trust boundaries. Re-run them against the public RPC rather than treating a recorded report as a live result.
