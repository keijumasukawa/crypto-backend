import { describe, expect, it } from "vitest";
import type { PrismaClient } from "../generated/prisma/client.ts";
import {
  getIndicatorValueRow,
  getLatestIndicatorValueOpenTime,
  getLatestKlineCloseTime,
  getLatestKlineOpenTime,
  getLatestSignalOpenTime,
  listActiveSymbols,
  listIndicatorValues,
  listIndicatorValuesAfter,
  listKlines,
  listKlinesAfter,
  listSignals,
  listSymbols,
} from "../src/read.ts";

function buildKlineRecord(openTime: number) {
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

function buildIndicatorValueRecord(openTime: number) {
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

describe("listActiveSymbols", () => {
  it("有効な銘柄のみを銘柄順で返す", async () => {
    let capturedArgs: unknown;
    const db = {
      symbol: {
        findMany: (args: unknown) => {
          capturedArgs = args;
          return Promise.resolve([
            { symbol: "BTCUSDT" },
            { symbol: "ETHUSDT" },
          ]);
        },
      },
    } as unknown as PrismaClient;

    const symbols = await listActiveSymbols(db);

    expect(symbols).toEqual(["BTCUSDT", "ETHUSDT"]);
    expect(capturedArgs).toMatchObject({
      where: { isActive: true },
      orderBy: { symbol: "asc" },
    });
  });
});

describe("getLatestKlineOpenTime", () => {
  it("最新の openTime を返し、空の場合は null を返す", async () => {
    let capturedArgs: unknown;
    const db = {
      kline: {
        findFirst: (args: unknown) => {
          capturedArgs = args;
          return Promise.resolve({ openTime: 1000n });
        },
      },
    } as unknown as PrismaClient;
    const emptyDb = {
      kline: {
        findFirst: () => Promise.resolve(null),
      },
    } as unknown as PrismaClient;

    const latestOpenTime = await getLatestKlineOpenTime(db, "BTCUSDT", "1d");
    const missingOpenTime = await getLatestKlineOpenTime(
      emptyDb,
      "BTCUSDT",
      "1d",
    );

    expect(latestOpenTime).toBe(1000n);
    expect(missingOpenTime).toBeNull();
    expect(capturedArgs).toMatchObject({
      where: { symbol: "BTCUSDT", interval: "1d" },
      orderBy: { openTime: "desc" },
    });
  });
});

describe("listKlinesAfter", () => {
  it("遡り分と新規分を時系列順に連結する", async () => {
    const calls: unknown[] = [];
    const results = [
      [buildKlineRecord(900), buildKlineRecord(800)],
      [buildKlineRecord(1100), buildKlineRecord(1200)],
    ];
    const db = {
      kline: {
        findMany: (args: unknown) => {
          calls.push(args);
          return Promise.resolve(results.shift() ?? []);
        },
      },
    } as unknown as PrismaClient;

    const rows = await listKlinesAfter(db, "BTCUSDT", "1d", 1000n, 2);

    expect(rows.map((row) => row.openTime)).toEqual([800n, 900n, 1100n, 1200n]);
    expect(calls[0]).toMatchObject({
      where: { symbol: "BTCUSDT", interval: "1d", openTime: { lte: 1000n } },
      orderBy: { openTime: "desc" },
      take: 2,
    });
    expect(calls[1]).toMatchObject({
      where: { symbol: "BTCUSDT", interval: "1d", openTime: { gt: 1000n } },
      orderBy: { openTime: "asc" },
    });
  });

  it("openTime が null の場合は全件を時系列順で返す", async () => {
    const calls: unknown[] = [];
    const db = {
      kline: {
        findMany: (args: unknown) => {
          calls.push(args);
          return Promise.resolve([buildKlineRecord(0), buildKlineRecord(100)]);
        },
      },
    } as unknown as PrismaClient;

    const rows = await listKlinesAfter(db, "BTCUSDT", "1d", null, 199);

    expect(rows).toHaveLength(2);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      where: { symbol: "BTCUSDT", interval: "1d" },
      orderBy: { openTime: "asc" },
    });
  });

  it("Decimal 値を文字列へ変換する", async () => {
    const record = {
      ...buildKlineRecord(0),
      close: { toString: () => "1.2345678901" },
    };
    const db = {
      kline: {
        findMany: () => Promise.resolve([record]),
      },
    } as unknown as PrismaClient;

    const rows = await listKlinesAfter(db, "BTCUSDT", "1d", null, 0);

    expect(rows[0]?.close).toBe("1.2345678901");
  });
});

describe("listKlines", () => {
  it("期間指定がない場合は最新側から limit 件を取得し昇順で返す", async () => {
    let capturedArgs: unknown;
    const db = {
      kline: {
        findMany: (args: unknown) => {
          capturedArgs = args;
          return Promise.resolve([
            buildKlineRecord(1200),
            buildKlineRecord(1100),
          ]);
        },
      },
    } as unknown as PrismaClient;

    const rows = await listKlines(db, "BTCUSDT", "1d", null, null, 2);

    expect(rows.map((row) => row.openTime)).toEqual([1100n, 1200n]);
    expect(capturedArgs).toMatchObject({
      where: { symbol: "BTCUSDT", interval: "1d" },
      orderBy: { openTime: "desc" },
      take: 2,
    });
  });

  it("期間指定がある場合は範囲を昇順で走査し先頭から limit 件を返す", async () => {
    let capturedArgs: unknown;
    const db = {
      kline: {
        findMany: (args: unknown) => {
          capturedArgs = args;
          return Promise.resolve([
            buildKlineRecord(1000),
            buildKlineRecord(1100),
          ]);
        },
      },
    } as unknown as PrismaClient;

    const rows = await listKlines(db, "BTCUSDT", "1d", 1000n, 2000n, 100);

    expect(rows.map((row) => row.openTime)).toEqual([1000n, 1100n]);
    expect(capturedArgs).toMatchObject({
      where: {
        symbol: "BTCUSDT",
        interval: "1d",
        openTime: { gte: 1000n, lte: 2000n },
      },
      orderBy: { openTime: "asc" },
      take: 100,
    });
  });

  it("片側のみの期間指定はその境界だけを条件に含める", async () => {
    let capturedArgs: unknown;
    const db = {
      kline: {
        findMany: (args: unknown) => {
          capturedArgs = args;
          return Promise.resolve([]);
        },
      },
    } as unknown as PrismaClient;

    await listKlines(db, "BTCUSDT", "1d", 1000n, null, 100);

    expect(capturedArgs).toMatchObject({
      where: { symbol: "BTCUSDT", interval: "1d", openTime: { gte: 1000n } },
      orderBy: { openTime: "asc" },
    });
  });
});

describe("getLatestIndicatorValueOpenTime", () => {
  it("最新の openTime を返し、空の場合は null を返す", async () => {
    const db = {
      indicatorValue: {
        findFirst: () => Promise.resolve({ openTime: 2000n }),
      },
    } as unknown as PrismaClient;
    const emptyDb = {
      indicatorValue: {
        findFirst: () => Promise.resolve(null),
      },
    } as unknown as PrismaClient;

    expect(await getLatestIndicatorValueOpenTime(db, "BTCUSDT", "1d")).toBe(
      2000n,
    );
    expect(
      await getLatestIndicatorValueOpenTime(emptyDb, "BTCUSDT", "1d"),
    ).toBeNull();
  });
});

describe("getIndicatorValueRow", () => {
  it("主キーで 1 行を返し、NULL 列を保持する", async () => {
    let capturedArgs: unknown;
    const db = {
      indicatorValue: {
        findUnique: (args: unknown) => {
          capturedArgs = args;
          return Promise.resolve(buildIndicatorValueRecord(0));
        },
      },
    } as unknown as PrismaClient;

    const row = await getIndicatorValueRow(db, "BTCUSDT", "1d", 0n);

    expect(row?.sma20).toBe("1.5");
    expect(row?.sma50).toBeNull();
    expect(row?.rsiAvgLoss14).toBe("0.5");
    expect(capturedArgs).toMatchObject({
      where: {
        symbol_interval_openTime: {
          symbol: "BTCUSDT",
          interval: "1d",
          openTime: 0n,
        },
      },
    });
  });
});

describe("listIndicatorValuesAfter", () => {
  it("遡り分と新規分を時系列順に連結する", async () => {
    const results = [
      [buildIndicatorValueRecord(900)],
      [buildIndicatorValueRecord(1100)],
    ];
    const db = {
      indicatorValue: {
        findMany: () => Promise.resolve(results.shift() ?? []),
      },
    } as unknown as PrismaClient;

    const rows = await listIndicatorValuesAfter(db, "BTCUSDT", "1d", 1000n, 1);

    expect(rows.map((row) => row.openTime)).toEqual([900n, 1100n]);
  });
});

describe("listIndicatorValues", () => {
  it("期間指定がない場合は最新側から limit 件を取得し昇順で返す", async () => {
    let capturedArgs: unknown;
    const db = {
      indicatorValue: {
        findMany: (args: unknown) => {
          capturedArgs = args;
          return Promise.resolve([
            buildIndicatorValueRecord(1200),
            buildIndicatorValueRecord(1100),
          ]);
        },
      },
    } as unknown as PrismaClient;

    const rows = await listIndicatorValues(db, "BTCUSDT", "1d", null, null, 2);

    expect(rows.map((row) => row.openTime)).toEqual([1100n, 1200n]);
    expect(capturedArgs).toMatchObject({
      where: { symbol: "BTCUSDT", interval: "1d" },
      orderBy: { openTime: "desc" },
      take: 2,
    });
  });

  it("期間指定がある場合は範囲を昇順で走査し先頭から limit 件を返す", async () => {
    let capturedArgs: unknown;
    const db = {
      indicatorValue: {
        findMany: (args: unknown) => {
          capturedArgs = args;
          return Promise.resolve([
            buildIndicatorValueRecord(1000),
            buildIndicatorValueRecord(1100),
          ]);
        },
      },
    } as unknown as PrismaClient;

    const rows = await listIndicatorValues(
      db,
      "BTCUSDT",
      "1d",
      1000n,
      2000n,
      100,
    );

    expect(rows.map((row) => row.openTime)).toEqual([1000n, 1100n]);
    expect(capturedArgs).toMatchObject({
      where: {
        symbol: "BTCUSDT",
        interval: "1d",
        openTime: { gte: 1000n, lte: 2000n },
      },
      orderBy: { openTime: "asc" },
      take: 100,
    });
  });

  it("片側のみの期間指定はその境界だけを条件に含める", async () => {
    let capturedArgs: unknown;
    const db = {
      indicatorValue: {
        findMany: (args: unknown) => {
          capturedArgs = args;
          return Promise.resolve([]);
        },
      },
    } as unknown as PrismaClient;

    await listIndicatorValues(db, "BTCUSDT", "1d", 1000n, null, 100);

    expect(capturedArgs).toMatchObject({
      where: { symbol: "BTCUSDT", interval: "1d", openTime: { gte: 1000n } },
      orderBy: { openTime: "asc" },
    });
  });
});

describe("getLatestSignalOpenTime", () => {
  it("logicVersion を含む条件で最新の openTime を返す", async () => {
    let capturedArgs: unknown;
    const db = {
      signal: {
        findFirst: (args: unknown) => {
          capturedArgs = args;
          return Promise.resolve({ openTime: 3000n });
        },
      },
    } as unknown as PrismaClient;

    const latestOpenTime = await getLatestSignalOpenTime(
      db,
      "BTCUSDT",
      "1d",
      "rule-v1",
    );

    expect(latestOpenTime).toBe(3000n);
    expect(capturedArgs).toMatchObject({
      where: { symbol: "BTCUSDT", interval: "1d", logicVersion: "rule-v1" },
      orderBy: { openTime: "desc" },
    });
  });
});

function buildSignalRecord(openTime: number) {
  return {
    symbol: "BTCUSDT",
    interval: "1d",
    openTime: BigInt(openTime),
    logicVersion: "rule-v1",
    direction: "neutral",
    score: "0.2",
    components: { v: [1, 0, 0, 0, 0], e: 31 },
    generatedAt: new Date("2026-08-06T00:00:00.000Z"),
  };
}

describe("listSignals", () => {
  it("logicVersion を含む条件で最新側から limit 件を取得し昇順で返す", async () => {
    let capturedArgs: unknown;
    const db = {
      signal: {
        findMany: (args: unknown) => {
          capturedArgs = args;
          return Promise.resolve([
            buildSignalRecord(1200),
            buildSignalRecord(1100),
          ]);
        },
      },
    } as unknown as PrismaClient;

    const rows = await listSignals(db, "BTCUSDT", "1d", "rule-v1", 2);

    expect(rows.map((row) => row.openTime)).toEqual([1100n, 1200n]);
    expect(capturedArgs).toMatchObject({
      where: { symbol: "BTCUSDT", interval: "1d", logicVersion: "rule-v1" },
      orderBy: { openTime: "desc" },
      take: 2,
    });
  });

  it("score の Decimal 値を文字列へ変換する", async () => {
    const record = {
      ...buildSignalRecord(0),
      score: { toString: () => "0.4000000000" },
    };
    const db = {
      signal: {
        findMany: () => Promise.resolve([record]),
      },
    } as unknown as PrismaClient;

    const rows = await listSignals(db, "BTCUSDT", "1d", "rule-v1", 1);

    expect(rows[0]?.score).toBe("0.4000000000");
  });
});

describe("listSymbols", () => {
  it("全銘柄を銘柄順で返す", async () => {
    let capturedArgs: unknown;
    const records = [
      {
        symbol: "BNBUSDT",
        baseAsset: "BNB",
        quoteAsset: "USDT",
        onboardDate: new Date("2017-11-06T00:00:00.000Z"),
        isActive: true,
      },
    ];
    const db = {
      symbol: {
        findMany: (args: unknown) => {
          capturedArgs = args;
          return Promise.resolve(records);
        },
      },
    } as unknown as PrismaClient;

    expect(await listSymbols(db)).toEqual(records);
    expect(capturedArgs).toMatchObject({ orderBy: { symbol: "asc" } });
  });
});

describe("getLatestKlineCloseTime", () => {
  it("インターバル全体の最新 closeTime を返し、空の場合は null を返す", async () => {
    let capturedArgs: unknown;
    const db = {
      kline: {
        findFirst: (args: unknown) => {
          capturedArgs = args;
          return Promise.resolve({ closeTime: 4999n });
        },
      },
    } as unknown as PrismaClient;
    const emptyDb = {
      kline: {
        findFirst: () => Promise.resolve(null),
      },
    } as unknown as PrismaClient;

    expect(await getLatestKlineCloseTime(db, "1h")).toBe(4999n);
    expect(await getLatestKlineCloseTime(emptyDb, "1h")).toBeNull();
    expect(capturedArgs).toMatchObject({
      where: { interval: "1h" },
      orderBy: { closeTime: "desc" },
    });
  });
});
