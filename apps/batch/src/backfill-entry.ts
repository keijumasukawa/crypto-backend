import { createPrismaClient } from "db";
import { createBinanceClient } from "./binance.ts";
import { updateSeries, validateKlineInterval } from "./series.ts";

const connectionString = process.env.DIRECT_URL;
if (connectionString === undefined) {
  throw new Error("環境変数 DIRECT_URL を設定してください。");
}
const symbol = process.env.SYMBOL;
if (symbol === undefined || symbol === "") {
  throw new Error("環境変数 SYMBOL を設定してください。");
}
const interval = validateKlineInterval(process.env.INTERVAL);

const db = createPrismaClient(connectionString);
const binance = createBinanceClient();

updateSeries(db, binance, symbol, interval, new Date(Date.now()))
  .then(async () => {
    await db.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
