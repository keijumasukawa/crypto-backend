import {
  createPrismaClient,
  deleteIndicatorValuesFrom,
  deleteSignalsFrom,
} from "db";
import { createBinanceClient } from "./binance.ts";
import {
  parseOpenTime,
  updateSeries,
  validateKlineInterval,
} from "./series.ts";

const connectionString = process.env.DIRECT_URL;
if (connectionString === undefined) {
  throw new Error("DIRECT_URL が設定されていません");
}
const symbol = process.env.SYMBOL;
if (symbol === undefined || symbol === "") {
  throw new Error("SYMBOL が設定されていません");
}
const interval = validateKlineInterval(process.env.INTERVAL);
const openTime = parseOpenTime(process.env.OPEN_TIME);

const db = createPrismaClient(connectionString);
const binance = createBinanceClient();

deleteSignalsFrom(db, symbol, interval, openTime)
  .then(() => deleteIndicatorValuesFrom(db, symbol, interval, openTime))
  .then(() => updateSeries(db, binance, symbol, interval, new Date(Date.now())))
  .then(async () => {
    await db.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
