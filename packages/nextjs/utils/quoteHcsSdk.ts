import { createRequire } from "node:module";

// Keep the SDK on Node's CommonJS export. Its ESM export failed ECDSA address derivation in this spike.
const nodeRequire = createRequire(__filename);
export const hcsSdk = nodeRequire("@hiero-ledger/sdk") as typeof import("@hiero-ledger/sdk");
