import { KLINE_INTERVALS } from "core";
import { listActiveSymbols } from "db";
import { updateSeries } from "./series.js";
import type { HourlyDependencies } from "./types.js";

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
