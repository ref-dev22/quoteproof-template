# Hosting the reference demo

QuoteProof's preview and receipt comparison use public Hedera Testnet reads. They do not need a database, a server wallet, or a private signing key. Hosting the app does not deploy the registry or create a quote.

## Vercel configuration

Import the entire repository and configure one Next.js project:

| Setting | Value |
| --- | --- |
| Root Directory | `packages/nextjs` |
| Include source files outside Root Directory | Enabled |
| Framework | Next.js |
| Build Command | `npm run build` |
| Output Directory | Framework default |
| Install Command | `cd ../.. && npm ci` (provided by `vercel.json`) |

The API imports receipt utilities from `packages/hardhat`, and dependencies are locked at the repository root. An upload containing only `packages/nextjs` is insufficient. The existing `outputFileTracingRoot` in `next.config.ts` also points to the repository root.

Vercel currently supports Node 20, 22 and 24. Its default is 24, and broad `engines.node` ranges can select the latest supported major. Check the actual remote build log; the published external-scaffold gate ran on Node 20.18.3 and is separate from a Vercel build.

Keep the public RPC defaults for the first read-only check. Never upload a local `.env`, encrypted Hardhat account, deployer key, or wallet seed. A WalletConnect project ID is optional configuration for wallet-provider use; wallet signing is not part of the read-only checks below.

## Check the hosted application

From the repository root, run the existing smoke script against the deployment:

```powershell
$env:RELEASE_SMOKE_BASE_URL = 'https://YOUR-DEPLOYMENT.vercel.app'
node scripts/release-smoke.mjs
Remove-Item Env:RELEASE_SMOKE_BASE_URL
```

It checks the homepage, live preview, two invalid amounts, the public genuine receipt, and an altered receipt. Network or feed failures remain failures; a successful build alone does not prove live verification works.

Open this path on the deployment in a private browser window:

```text
/?tx=0x076690438e81f96fc77f3f6467157d2f53c05703ef098790a42b82909a340ef9
```

The existing transaction should load an event-bound receipt without a wallet. Click **Compare stored commitment** and inspect local consistency, historical oracle and stored commitment results. No new transaction is required. The current share loader reads the transaction through JSON-RPC; the Mirror Node link is a separate inspection link.

## References

- [Vercel monorepos](https://vercel.com/docs/monorepos)
- [Sharing source files outside the project root](https://vercel.com/docs/monorepos/monorepo-faq)
- [Supported Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)

These instructions describe deployment configuration and checks, not evidence that a particular hosted URL has passed them.
