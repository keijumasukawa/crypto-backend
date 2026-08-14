import type { KlineRow } from "db";
import type { Kline, KlineInterval } from "./binance.ts";

export function buildKlineRows(
  symbol: string,
  interval: KlineInterval,
  klines: Kline[],
): KlineRow[] {
  return klines.map((kline) => ({
    symbol,
    interval,
    openTime: kline.openTime,
    open: kline.open,
    high: kline.high,
    low: kline.low,
    close: kline.close,
    volume: kline.volume,
    closeTime: kline.closeTime,
    quoteAssetVolume: kline.quoteAssetVolume,
    numberOfTrades: kline.numberOfTrades,
    takerBuyBaseAssetVolume: kline.takerBuyBaseAssetVolume,
    takerBuyQuoteAssetVolume: kline.takerBuyQuoteAssetVolume,
  }));
}
