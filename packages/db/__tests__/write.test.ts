import { describe, expect, it } from "vitest";
import type { Prisma, PrismaClient } from "../generated/prisma/client.ts";
import type { IndicatorValueRow, KlineRow, SignalRow } from "../src/types.ts";
import {
  deleteIndicatorValuesFrom,
  deleteSignalsFrom,
  updateIndicatorValues,
  updateKlines,
  updateSignals,
} from "../src/write.ts";

function buildExecutorStub() {
  const queries: Prisma.Sql[] = [];
  const executorStub = {
    $executeRaw: (query: Prisma.Sql): Promise<number> => {
      queries.push(query);
      return Promise.resolve(0);
    },
  };
  return { executorStub, queries };
}

function buildKlineRow(openTime: number): KlineRow {
  return {
    symbol: "BTCUSDT",
    interval: "1d",
    openTime: BigInt(openTime),
    open: "1",
    high: "2",
    low: "0.5",
    close: "1.5",
    volume: "10",
    closeTime: BigInt(openTime + 1),
    quoteAssetVolume: "15",
    numberOfTrades: 3,
    takerBuyBaseAssetVolume: "5",
    takerBuyQuoteAssetVolume: "7.5",
  };
}

function buildIndicatorValueRow(openTime: number): IndicatorValueRow {
  return {
    symbol: "BTCUSDT",
    interval: "1d",
    openTime: BigInt(openTime),
    sma20: "1.5",
    sma50: null,
    sma200: null,
    ema12: "1.4",
    ema26: null,
    rsi14: "66.6666666667",
    macd: null,
    macdSignal: null,
    macdHist: null,
    bbUpper: null,
    bbMiddle: null,
    bbLower: null,
    rsiAvgGain14: "1",
    rsiAvgLoss14: "0.5",
  };
}

function buildSignalRow(openTime: number): SignalRow {
  return {
    symbol: "BTCUSDT",
    interval: "1d",
    openTime: BigInt(openTime),
    logicVersion: "rule-v1",
    direction: "bullish",
    score: "0.4",
    components: { maTrend: { result: 1, weight: 1 } },
    generatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

describe("updateKlines", () => {
  it("2,500 行を 1,000 行ずつ 3 文に分割して実行する", async () => {
    const { executorStub, queries } = buildExecutorStub();
    const rows = Array.from({ length: 2500 }, (_, index) =>
      buildKlineRow(index),
    );

    await updateKlines(executorStub, rows);

    expect(queries).toHaveLength(3);
    expect(queries[0]?.values).toHaveLength(13000);
    expect(queries[1]?.values).toHaveLength(13000);
    expect(queries[2]?.values).toHaveLength(6500);
  });

  it("0 行では SQL を実行しない", async () => {
    const { executorStub, queries } = buildExecutorStub();

    await updateKlines(executorStub, []);

    expect(queries).toHaveLength(0);
  });

  it("主キー 3 列の ON CONFLICT 句と全更新列を含む", async () => {
    const { executorStub, queries } = buildExecutorStub();

    await updateKlines(executorStub, [buildKlineRow(0)]);

    const sqlText = queries[0]?.sql ?? "";
    expect(sqlText).toContain(
      "ON CONFLICT (symbol, interval, open_time) DO UPDATE SET",
    );
    expect(sqlText).toContain("open = EXCLUDED.open");
    expect(sqlText).toContain(
      "quote_asset_volume = EXCLUDED.quote_asset_volume",
    );
    expect(sqlText).toContain(
      "taker_buy_quote_asset_volume = EXCLUDED.taker_buy_quote_asset_volume",
    );
  });
});

describe("updateIndicatorValues", () => {
  it("1 行あたりのパラメータ数が列数と一致する", async () => {
    const { executorStub, queries } = buildExecutorStub();

    await updateIndicatorValues(executorStub, [buildIndicatorValueRow(0)]);

    expect(queries[0]?.values).toHaveLength(17);
  });

  it("NULL の指標値をそのまま渡す", async () => {
    const { executorStub, queries } = buildExecutorStub();

    await updateIndicatorValues(executorStub, [buildIndicatorValueRow(0)]);

    expect(queries[0]?.values).toContain(null);
    expect(queries[0]?.values).toContain("66.6666666667");
  });
});

describe("updateSignals", () => {
  it("主キー 4 列の ON CONFLICT 句を含む", async () => {
    const { executorStub, queries } = buildExecutorStub();

    await updateSignals(executorStub, [buildSignalRow(0)]);

    const sqlText = queries[0]?.sql ?? "";
    expect(sqlText).toContain(
      "ON CONFLICT (symbol, interval, open_time, logic_version) DO UPDATE SET",
    );
    expect(queries[0]?.values).toHaveLength(8);
  });

  it("components を JSON 文字列として渡す", async () => {
    const { executorStub, queries } = buildExecutorStub();

    await updateSignals(executorStub, [buildSignalRow(0)]);

    expect(queries[0]?.values).toContain('{"maTrend":{"result":1,"weight":1}}');
  });
});

describe("deleteSignalsFrom", () => {
  it("系列と openTime 以上を条件に削除する", async () => {
    let capturedArgs: unknown;
    const db = {
      signal: {
        deleteMany: (args: unknown) => {
          capturedArgs = args;
          return Promise.resolve({ count: 0 });
        },
      },
    } as unknown as PrismaClient;

    await deleteSignalsFrom(db, "BTCUSDT", "1d", 1000n);

    expect(capturedArgs).toMatchObject({
      where: { symbol: "BTCUSDT", interval: "1d", openTime: { gte: 1000n } },
    });
  });
});

describe("deleteIndicatorValuesFrom", () => {
  it("系列と openTime 以上を条件に削除する", async () => {
    let capturedArgs: unknown;
    const db = {
      indicatorValue: {
        deleteMany: (args: unknown) => {
          capturedArgs = args;
          return Promise.resolve({ count: 0 });
        },
      },
    } as unknown as PrismaClient;

    await deleteIndicatorValuesFrom(db, "BTCUSDT", "1d", 1000n);

    expect(capturedArgs).toMatchObject({
      where: { symbol: "BTCUSDT", interval: "1d", openTime: { gte: 1000n } },
    });
  });
});
