export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const operatorId = process.env.HCS_OPERATOR_ID;
  const operatorKey = process.env.HCS_OPERATOR_KEY;
  if (!operatorId && !operatorKey) return;
  if (!operatorId || !operatorKey) {
    process.env.HCS_ANCHOR_DISABLED = "true";
    console.error("HCS anchoring disabled: incomplete operator configuration");
    return;
  }

  try {
    const { checkHcsOperatorMirrorIdentity, hcsOperatorEvmAddress, loadHcsOperatorKey } =
      await import("./utils/quoteHcsOperator");
    const key = loadHcsOperatorKey(operatorKey);
    console.info("HCS operator startup", { accountId: operatorId, evmAddress: hcsOperatorEvmAddress(key) });
    if (!(await checkHcsOperatorMirrorIdentity(operatorId, key))) {
      process.env.HCS_ANCHOR_DISABLED = "true";
      console.error("HCS anchoring disabled: operator EVM address differs from Mirror account");
    }
  } catch (error) {
    process.env.HCS_ANCHOR_DISABLED = "true";
    console.error("HCS anchoring disabled: operator identity check failed", {
      name: error instanceof Error ? error.name : "unknown",
      message: error instanceof Error ? error.message : undefined,
    });
  }
}
