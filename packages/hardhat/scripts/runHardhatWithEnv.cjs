// eslint-disable-next-line @typescript-eslint/no-require-imports -- this launcher is intentionally CommonJS
const { spawnSync } = require("node:child_process");

const mode = process.argv[2];
const args = process.argv.slice(3);
const commands = {
  test: { env: { HEDERA_FORKING: "false", REPORT_GAS: "false" }, args: ["test"] },
  chain: { env: { HEDERA_FORKING: "true" }, args: ["node", "--network", "hardhat", "--no-deploy"] },
  fork: {
    env: { HEDERA_FORKING: "true", MAINNET_FORKING_ENABLED: "true" },
    args: ["node", "--network", "hardhat", "--no-deploy"],
  },
};

const command = commands[mode];
if (!command) {
  console.error(`Unknown Hardhat command mode: ${mode || "missing"}`);
  process.exit(2);
}

const hardhatCli = require.resolve("hardhat/internal/cli/cli.js");
const result = spawnSync(process.execPath, [hardhatCli, ...command.args, ...args], {
  env: { ...process.env, ...command.env },
  stdio: "inherit",
  shell: false,
});

process.exit(result.status ?? 1);
