// Run with: node --env-file=packages/nextjs/.env.local packages/nextjs/scripts/createHcsTopic.cjs
// Creates one Hedera Testnet topic restricted to the configured server operator key.
const { AccountId, Client, PrivateKey, TopicCreateTransaction, TransactionId } = require("@hiero-ledger/sdk");

async function main() {
  const operatorId = process.env.HCS_OPERATOR_ID;
  const operatorKey = process.env.HCS_OPERATOR_KEY;
  if (!/^0\.0\.[1-9][0-9]*$/.test(operatorId ?? "") || !/^0x[0-9a-fA-F]{64}$/.test(operatorKey ?? "")) {
    throw new Error("Set a valid HCS_OPERATOR_ID and HCS_OPERATOR_KEY in ignored server environment");
  }
  if (process.env.HCS_TOPIC_ID) throw new Error("HCS_TOPIC_ID is already configured; refusing to create another topic");

  const account = AccountId.fromString(operatorId);
  const key = PrivateKey.fromStringECDSA(operatorKey.slice(2));
  const client = Client.forTestnet().setOperator(account, key);
  try {
    const transaction = new TopicCreateTransaction()
      .setTopicMemo("QuoteProof receipt anchor testnet spike")
      .setSubmitKey(key.publicKey)
      .setAdminKey(key.publicKey)
      .setTransactionId(TransactionId.generate(account))
      .freezeWith(client);
    await transaction.sign(key);
    const submitted = await transaction.execute(client);
    const receipt = await submitted.getReceipt(client);
    if (!receipt.topicId) throw new Error("Topic creation returned no topic ID");
    console.log(JSON.stringify({ topicId: receipt.topicId.toString(), operatorId, submitKeyRestricted: true }));
  } finally {
    client.close();
  }
}

main().catch(error => {
  console.error(error?.message ?? "HCS topic creation failed");
  process.exitCode = 1;
});
