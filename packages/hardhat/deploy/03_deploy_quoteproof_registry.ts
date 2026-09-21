import { Contract } from "ethers";
import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";

const HEDERA_TESTNET_CHAIN_ID = 296n;
const CHAINLINK_HBAR_USD_PROXY = "0x59bC155EB6c6C415fE43255aF66EcF0523c92B4a";
const EXPECTED_DECIMALS = 8;
const MAX_AGE_SECONDS = 93_600;

const deployQuoteProofRegistry: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const liveNetwork = await hre.ethers.provider.getNetwork();
  if (liveNetwork.chainId !== HEDERA_TESTNET_CHAIN_ID) {
    throw new Error(`QuoteProof live deployment requires chain ID 296; provider reported ${liveNetwork.chainId}`);
  }
  if (!process.env.__RUNTIME_DEPLOYER_PRIVATE_KEY) {
    throw new Error("QuoteProof live deployment requires the interactive encrypted-account wrapper");
  }

  const code = await hre.ethers.provider.getCode(CHAINLINK_HBAR_USD_PROXY);
  if (code === "0x") throw new Error("Configured Chainlink HBAR/USD proxy has no on-chain code");

  const oracle = new Contract(
    CHAINLINK_HBAR_USD_PROXY,
    ["function decimals() view returns (uint8)", "function description() view returns (string)"],
    hre.ethers.provider,
  );
  const decimals = Number(await oracle.decimals());
  const description = await oracle.description();
  if (decimals !== EXPECTED_DECIMALS || description !== "HBAR / USD") {
    throw new Error(`Configured feed identity mismatch: ${description} with ${decimals} decimals`);
  }

  const { deployer } = await hre.getNamedAccounts();
  await hre.deployments.deploy("QuoteProofRegistry", {
    from: deployer,
    args: [CHAINLINK_HBAR_USD_PROXY, EXPECTED_DECIMALS, MAX_AGE_SECONDS],
    log: true,
    autoMine: true,
  });
};

deployQuoteProofRegistry.tags = ["QuoteProof"];
export default deployQuoteProofRegistry;
