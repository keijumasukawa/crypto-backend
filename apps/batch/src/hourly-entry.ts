import { createPrismaClient } from "db";
import { createBinanceClient } from "./binance.ts";
import { main } from "./hourly.ts";

const connectionString = process.env.DIRECT_URL;
if (connectionString === undefined) {
  throw new Error("DIRECT_URL が設定されていません");
}

const db = createPrismaClient(connectionString);
const binance = createBinanceClient();

main({ db, binance, now: Date.now })
  .then(async () => {
    await db.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
