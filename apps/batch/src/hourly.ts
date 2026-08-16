import { KLINE_INTERVALS } from "core";
import { listActiveSymbols } from "db";
import { updateSeries } from "./series.js";
import type { HourlyDependencies } from "./types.js";

export async function main(dependencies: HourlyDependencies): Promise<void> {
  const { db, binance, now } = dependencies;
  const generatedAt = new Date(now());

  const symbols = await listActiveSymbols(db);
  const failedSeries: string[] = [];
  for (const symbol of symbols) {
    for (const interval of KLINE_INTERVALS) {
      try {
        await updateSeries(db, binance, symbol, interval, generatedAt);
      } catch (error) {
        failedSeries.push(`${symbol} ${interval}`);
        console.error(error);
      }
    }
  }
  if (failedSeries.length > 0) {
    throw new Error(
      `一部の系列の更新に失敗しました(${failedSeries.join("、")})。ログを確認してください。`,
    );
  }
}
