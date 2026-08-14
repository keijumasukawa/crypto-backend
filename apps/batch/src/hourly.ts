import { listActiveSymbols, type PrismaClient } from "db";
import { KLINE_INTERVALS, type BinanceClient } from "./binance.ts";
import { updateSeries } from "./series.ts";

export type HourlyDependencies = {
  db: PrismaClient;
  binance: BinanceClient;
  now: () => number;
};

export async function main(dependencies: HourlyDependencies): Promise<void> {
  const { db, binance, now } = dependencies;
  const generatedAt = new Date(now());

  const symbols = await listActiveSymbols(db);
  for (const symbol of symbols) {
    for (const interval of KLINE_INTERVALS) {
      await updateSeries(db, binance, symbol, interval, generatedAt);
    }
  }
}
