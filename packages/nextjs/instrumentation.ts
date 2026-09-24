export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { checkHcsOperatorAtStartup } = await import("./utils/quoteHcsStartup");
    await checkHcsOperatorAtStartup();
  }
}
