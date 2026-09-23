import deployedContracts from "./deployedContracts";
import type { Hex } from "viem";

export const QUOTE_PROOF_TESTNET_CHAIN_ID = 296n;

// Deployment generation updates this address alongside the Scaffold contract hooks.
export function getQuoteProofRegistryAddress(): Hex {
  return deployedContracts[296].QuoteProofRegistry.address as Hex;
}

// The testnet deploy script validates and pins this HBAR/USD feed for every registry.
export const QUOTE_PROOF_ORACLE_ADDRESS = "0x59bC155EB6c6C415fE43255aF66EcF0523c92B4a" as const;
