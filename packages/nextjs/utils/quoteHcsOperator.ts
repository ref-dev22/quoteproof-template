import { HCS_MIRROR_BASE, HCS_TIMEOUT_MS, isHederaId, readBoundedJson } from "./quoteHcs";
import { hcsSdk } from "./quoteHcsSdk";
import type { PrivateKey } from "@hiero-ledger/sdk";

const ECDSA_KEY_RE = /^0x[0-9a-fA-F]{64}$/;
const RAW_PUBLIC_KEY_RE = /^[0-9a-fA-F]{66}$/;

export function loadHcsOperatorKey(value: string): PrivateKey {
  if (!ECDSA_KEY_RE.test(value)) throw new Error("Invalid HCS operator key format");
  return hcsSdk.PrivateKey.fromStringECDSA(value.slice(2));
}

export function hcsOperatorEvmAddress(key: PrivateKey): string {
  return `0x${key.publicKey.toEvmAddress().toLowerCase()}`;
}

export function matchesHcsOperatorMirrorAccount(account: unknown, operatorId: string, key: PrivateKey): boolean {
  if (!account || typeof account !== "object") return false;
  const record = account as { account?: unknown; key?: { _type?: unknown; key?: unknown }; deleted?: unknown };
  return (
    record.account === operatorId &&
    record.deleted !== true &&
    record.key?._type === "ECDSA_SECP256K1" &&
    typeof record.key.key === "string" &&
    RAW_PUBLIC_KEY_RE.test(record.key.key) &&
    record.key.key.toLowerCase() === key.publicKey.toStringRaw().toLowerCase()
  );
}

export async function checkHcsOperatorMirrorIdentity(operatorId: string, key: PrivateKey): Promise<boolean> {
  if (!isHederaId(operatorId)) return false;
  const response = await fetch(`${HCS_MIRROR_BASE}/accounts/${operatorId}?transactions=false`, {
    signal: AbortSignal.timeout(HCS_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error("Mirror operator metadata unavailable");
  return matchesHcsOperatorMirrorAccount(await readBoundedJson(response), operatorId, key);
}

export function matchesHcsTopicSubmitKey(topic: unknown, operatorKey: PrivateKey): boolean {
  if (!topic || typeof topic !== "object") return false;
  const submit = (topic as { submit_key?: { _type?: unknown; key?: unknown } }).submit_key;
  return (
    submit?._type === "ECDSA_SECP256K1" &&
    typeof submit.key === "string" &&
    RAW_PUBLIC_KEY_RE.test(submit.key) &&
    submit.key.toLowerCase() === operatorKey.publicKey.toStringRaw().toLowerCase()
  );
}
