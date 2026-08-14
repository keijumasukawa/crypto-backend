import type { IndicatorValueRow, KlineRow } from "db";
import { describe, expect, it } from "vitest";
import { buildSignalRows } from "../src/signal-rows.ts";

const GENERATED_AT = new Date("2026-01-01T00:00:00.000Z");

function buildKlineRow(openTime: number, close: string): KlineRow {
  return {
    symbol: "BTCUSDT",
    interval: "1d",
    openTime: BigInt(openTime),
    open: close,
    high: close,
    low: close,
    close,
    volume: "1",
    closeTime: BigInt(openTime + 1),
    quoteAssetVolume: "1",
    numberOfTrades: 1,
    takerBuyBaseAssetVolume: "1",
    takerBuyQuoteAssetVolume: "1",
  };
}

function buildIndicatorValueRow(
  openTime: number,
  overrides: Partial<IndicatorValueRow> = {},
): IndicatorValueRow {
  return {
    symbol: "BTCUSDT",
    interval: "1d",
    openTime: BigInt(openTime),
    sma20: null,
    sma50: null,
    sma200: null,
    ema12: null,
    ema26: null,
    rsi14: null,
    macd: null,
    macdSignal: null,
    macdHist: null,
    bbUpper: null,
    bbMiddle: null,
    bbLower: null,
    rsiAvgGain14: null,
    rsiAvgLoss14: null,
    ...overrides,
  };
}

function buildWarmupSeries(count: number): {
  indicatorValues: IndicatorValueRow[];
  klines: KlineRow[];
} {
  const indicatorValues: IndicatorValueRow[] = [];
  const klines: KlineRow[] = [];
  for (let index = 0; index < count; index += 1) {
    klines.push(buildKlineRow(index, "100"));
    indicatorValues.push(
      buildIndicatorValueRow(index, {
        rsi14: index >= 14 ? "50" : null,
        sma20: index >= 19 ? "100" : null,
        bbUpper: index >= 19 ? "110" : null,
        bbMiddle: index >= 19 ? "100" : null,
        bbLower: index >= 19 ? "90" : null,
        sma50: index >= 49 ? "100" : null,
        macdHist: index >= 33 ? "0" : null,
        sma200: index >= 199 ? "100" : null,
      }),
    );
  }
  return { indicatorValues, klines };
}

function getStoredComponents(components: unknown): { v: number[]; e: number } {
  if (
    typeof components === "object" &&
    components !== null &&
    "v" in components &&
    "e" in components &&
    Array.isArray(components.v) &&
    typeof components.e === "number"
  ) {
    return { v: components.v as number[], e: components.e };
  }
  throw new Error("components が圧縮形ではない");
}

describe("buildSignalRows", () => {
  it("空の系列には空の結果を返す", () => {
    expect(buildSignalRows([], [], null, GENERATED_AT)).toEqual([]);
  });

  it("起点 null で指標行と同数の行を生成し、最初の足は中立になる", () => {
    const { indicatorValues, klines } = buildWarmupSeries(30);

    const rows = buildSignalRows(indicatorValues, klines, null, GENERATED_AT);

    expect(rows).toHaveLength(30);
    const firstComponents = getStoredComponents(rows[0]?.components);
    expect(firstComponents.e).toBe(0);
    expect(firstComponents.v).toEqual([0, 0, 0, 0, 0]);
    expect(rows[0]?.direction).toBe("neutral");
  });

  it("ウォームアップ期間の評価可能なルールが初期化の境界で増加する", () => {
    const { indicatorValues, klines } = buildWarmupSeries(201);

    const rows = buildSignalRows(indicatorValues, klines, null, GENERATED_AT);

    const bitmasks = new Map<number, number>();
    for (const [index, row] of rows.entries()) {
      bitmasks.set(index, getStoredComponents(row.components).e);
    }
    expect(bitmasks.get(14)).toBe(0);
    expect(bitmasks.get(15)).toBe(4);
    expect(bitmasks.get(20)).toBe(20);
    expect(bitmasks.get(34)).toBe(28);
    expect(bitmasks.get(199)).toBe(29);
    expect(bitmasks.get(200)).toBe(31);
  });

  it("起点を指定すると後続分のみ生成し、遡り行を前足として使う", () => {
    const indicatorValues = [
      buildIndicatorValueRow(100, { rsi14: "28" }),
      buildIndicatorValueRow(200, { rsi14: "35" }),
    ];
    const klines = [buildKlineRow(100, "100"), buildKlineRow(200, "101")];

    const rows = buildSignalRows(indicatorValues, klines, 100n, GENERATED_AT);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.openTime).toBe(200n);
    const components = getStoredComponents(rows[0]?.components);
    expect(components.v).toEqual([0, 0, 1, 0, 0]);
    expect(components.e).toBe(4);
  });

  it("対応する終値がない場合は例外とする", () => {
    const indicatorValues = [buildIndicatorValueRow(100)];

    expect(() =>
      buildSignalRows(indicatorValues, [], null, GENERATED_AT),
    ).toThrow("終値");
  });

  it("生成時刻と logicVersion が行に設定される", () => {
    const indicatorValues = [buildIndicatorValueRow(100)];
    const klines = [buildKlineRow(100, "100")];

    const rows = buildSignalRows(indicatorValues, klines, null, GENERATED_AT);

    expect(rows[0]?.logicVersion).toBe("rule-v1");
    expect(rows[0]?.generatedAt).toBe(GENERATED_AT);
    expect(rows[0]?.score).toBe("0");
  });
});
