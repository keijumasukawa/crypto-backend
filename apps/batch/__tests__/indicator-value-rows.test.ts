import type { KlineRow } from "db";
import { describe, expect, it } from "vitest";
import { buildIndicatorValueRows } from "../src/indicator-value-rows.ts";

const LOOKBACK_COUNT = 199;

function buildKlines(count: number): KlineRow[] {
  const klines: KlineRow[] = [];
  let price = 100;
  for (let index = 0; index < count; index += 1) {
    const step = (((index * 7) % 13) - 6) * 0.37;
    price = Math.round((price + step) * 100) / 100;
    klines.push({
      symbol: "BTCUSDT",
      interval: "1d",
      openTime: BigInt(index * 100),
      open: String(price),
      high: String(price),
      low: String(price),
      close: String(price),
      volume: "1",
      closeTime: BigInt(index * 100 + 99),
      quoteAssetVolume: "1",
      numberOfTrades: 1,
      takerBuyBaseAssetVolume: "1",
      takerBuyQuoteAssetVolume: "1",
    });
  }
  return klines;
}

describe("buildIndicatorValueRows", () => {
  it("空系列には空の結果を返す", () => {
    expect(buildIndicatorValueRows([], null, null)).toEqual([]);
  });

  it("起点 null で全行を出力し、初期化に満たない区間は NULL とする", () => {
    const klines = buildKlines(30);

    const rows = buildIndicatorValueRows(klines, null, null);

    expect(rows).toHaveLength(30);
    expect(rows[0]?.sma20).toBeNull();
    expect(rows[19]?.sma20).not.toBeNull();
    expect(rows[10]?.ema12).toBeNull();
    expect(rows[11]?.ema12).not.toBeNull();
    expect(rows[13]?.rsi14).toBeNull();
    expect(rows[14]?.rsi14).not.toBeNull();
    expect(rows[29]?.sma200).toBeNull();
    expect(rows[29]?.macdSignal).toBeNull();
  });

  it("全期間の一括計算と遡り付きの増分計算が任意の分割点で一致する", () => {
    const klines = buildKlines(260);
    const wholeSeries = buildIndicatorValueRows(klines, null, null);

    for (const split of [10, 20, 30, 40, 220, 250]) {
      const boundary = klines[split - 1];
      const previousState = wholeSeries[split - 1];
      if (boundary === undefined || previousState === undefined) {
        throw new Error("分割点が不正");
      }
      const sliceStart = Math.max(0, split - LOOKBACK_COUNT);
      const incremental = buildIndicatorValueRows(
        klines.slice(sliceStart),
        boundary.openTime,
        previousState,
      );
      expect(incremental).toEqual(wholeSeries.slice(split));
    }
  });

  it("前行の状態がある場合は新規足のみの入力で継続計算になる", () => {
    const klines = buildKlines(260);
    const wholeSeries = buildIndicatorValueRows(klines, null, null);
    const split = 240;
    const boundary = klines[split - 1];
    const previousState = wholeSeries[split - 1];
    if (boundary === undefined || previousState === undefined) {
      throw new Error("分割点が不正");
    }

    const incremental = buildIndicatorValueRows(
      klines.slice(split - LOOKBACK_COUNT),
      boundary.openTime,
      previousState,
    );

    expect(incremental.map((row) => row.ema12)).toEqual(
      wholeSeries.slice(split).map((row) => row.ema12),
    );
    expect(incremental.map((row) => row.rsiAvgGain14)).toEqual(
      wholeSeries.slice(split).map((row) => row.rsiAvgGain14),
    );
  });

  it("出力行のキーが入力の klines と対応する", () => {
    const klines = buildKlines(5);

    const rows = buildIndicatorValueRows(klines, null, null);

    expect(rows.map((row) => row.openTime)).toEqual(
      klines.map((kline) => kline.openTime),
    );
    expect(rows[0]?.symbol).toBe("BTCUSDT");
    expect(rows[0]?.interval).toBe("1d");
  });
});
