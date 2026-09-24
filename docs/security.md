# Dependency audit

On 25 September 2026, `npm audit --omit=dev --json` was run at the repository root against the committed npm lockfile. The command exited with status 1 and reported 35 findings: 6 high, 29 moderate, 0 critical, 0 low and 0 informational. This is a dependency advisory report, not a test of whether an issue is reachable through QuoteProof's routes.

High-severity package names: `@hiero-ledger/proto`, `@hiero-ledger/sdk`, `axios`, `postcss`, `protobufjs`, `ws`.

Moderate-severity package names: `@gemini-wallet/core`, `@metamask/rpc-errors`, `@metamask/sdk`, `@metamask/sdk-communication-layer`, `@metamask/utils`, `@rainbow-me/rainbowkit`, `@reown/appkit`, `@reown/appkit-controllers`, `@reown/appkit-pay`, `@reown/appkit-scaffold-ui`, `@reown/appkit-ui`, `@reown/appkit-utils`, `@scaffold-hbar-ui/components`, `@scaffold-hbar-ui/debug-contracts`, `@scaffold-hbar-ui/hooks`, `@wagmi/connectors`, `@walletconnect/core`, `@walletconnect/ethereum-provider`, `@walletconnect/sign-client`, `@walletconnect/universal-provider`, `@walletconnect/utils`, `burner-connector`, `decode-uri-component`, `ethers`, `next`, `query-string`, `uuid`, `viem`, `wagmi`.

Installed versions checked with `npm ls`: `@hiero-ledger/sdk@2.88.0`, `@hiero-ledger/proto@2.31.0`, `next@15.5.25`, and `burner-connector@0.0.20`. `npm view @hiero-ledger/sdk version` also returned `2.88.0` on that date. The audit suggested `next@16.3.6` for the `postcss` and `next` findings, `@hiero-ledger/proto@2.25.0` for the `protobufjs` and proto findings, and `burner-connector@0.0.21` for the `ws` and burner findings; npm marked each of those suggestions as a major change. Other findings have different fix statuses. None of those suggested changes was applied or validated here.

The HCS anchor route requires a bearer token before parsing a bounded request body. It validates the receipt, confirms a matching `QuoteRecorded` event, checks the configured operator and topic submit key through the Mirror Node, then uses the Hiero SDK to submit an eight-field anchor message. The Node startup check also loads the SDK to validate an operator key when HCS credentials are configured; the standalone topic-creation script uses it as well. The HCS verification route reads the Mirror Node without SDK signing. These code paths do not establish whether any reported dependency advisory can be exploited through the app.

Re-run `npm audit --omit=dev` against your installed lockfile and review the current advisories before production use.
