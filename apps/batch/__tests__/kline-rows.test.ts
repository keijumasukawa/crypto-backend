import { describe, expect, it } from "vitest";
import type { Kline } from "../src/binance.ts";
import { buildKlineRows } from "../src/kline-rows.ts";

function buildKline(openTime: number): Kline {
  return {
    openTime: BigInt(openTime),
    open: "1.1",
    high: "2.2",
    low: "0.5",
    close: "1.5",
    volume: "10.5",
    closeTime: BigInt(openTime + 99),
    quoteAssetVolume: "15.75",
    numberOfTrades: 3,
    takerBuyBaseAssetVolume: "5.25",
    takerBuyQuoteAssetVolume: "7.875",
  };
}

describe("buildKlineRows", () => {
  it("空の系列には空の結果を返す", () => {
    expect(buildKlineRows("BTCUSDT", "1d", [])).toEqual([]);
  });

  it("銘柄・インターバルを付与し、全フィールドを対応する位置へ写す", () => {
    const rows = buildKlineRows("BTCUSDT", "1d", [
      buildKline(100),
      buildKline(200),
    ]);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      symbol: "BTCUSDT",
      interval: "1d",
      openTime: 100n,
      open: "1.1",
      high: "2.2",
      low: "0.5",
      close: "1.5",
      volume: "10.5",
      closeTime: 199n,
      quoteAssetVolume: "15.75",
      numberOfTrades: 3,
      takerBuyBaseAssetVolume: "5.25",
      takerBuyQuoteAssetVolume: "7.875",
    });
    expect(rows[1]?.openTime).toBe(200n);
  });

  it("価格の文字列と時刻の bigint を無変換のまま保持する", () => {
    const rows = buildKlineRows("ETHUSDT", "1h", [buildKline(0)]);

    expect(typeof rows[0]?.close).toBe("string");
    expect(typeof rows[0]?.openTime).toBe("bigint");
    expect(rows[0]?.close).toBe("1.5");
  });
});
