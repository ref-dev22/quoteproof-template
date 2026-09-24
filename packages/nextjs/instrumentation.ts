export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const operatorId = process.env.HCS_OPERATOR_ID;
  const operatorKey = process.env.HCS_OPERATOR_KEY;
  if (!operatorId && !operatorKey) return;
  if (!operatorId || !operatorKey) {
    console.error("HCS anchoring unavailable: incomplete operator configuration");
    return;
  }

  try {
    const { checkHcsOperatorMirrorIdentity, hcsOperatorEvmAddress, loadHcsOperatorKey } =
      await import("./utils/quoteHcsOperator");
    const key = loadHcsOperatorKey(operatorKey);
    console.info("HCS operator startup", { accountId: operatorId, evmAddress: hcsOperatorEvmAddress(key) });
    if (!(await checkHcsOperatorMirrorIdentity(operatorId, key))) {
      console.error("HCS anchoring unavailable: operator public key differs from Mirror account");
    }
  } catch (error) {
    console.error("HCS anchoring unavailable: operator identity check failed", {
      name: error instanceof Error ? error.name : "unknown",
      message: error instanceof Error ? error.message : undefined,
    });
  }
}
