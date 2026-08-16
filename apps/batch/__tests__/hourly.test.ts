import type { IndicatorValueRow, KlineRow, PrismaClient } from "db";
import {
  getIndicatorValueRow,
  getLatestIndicatorValueOpenTime,
  getLatestKlineOpenTime,
  getLatestSignalOpenTime,
  listActiveSymbols,
  listIndicatorValuesAfter,
  listKlinesAfter,
  updateIndicatorValues,
  updateKlines,
  updateSignals,
} from "db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { main } from "../src/hourly.js";
import type { HourlyDependencies, Kline } from "../src/types.js";

vi.mock("db", () => ({
  listActiveSymbols: vi.fn(),
  getLatestKlineOpenTime: vi.fn(),
  listKlinesAfter: vi.fn(),
  getLatestIndicatorValueOpenTime: vi.fn(),
  getIndicatorValueRow: vi.fn(),
  listIndicatorValuesAfter: vi.fn(),
  getLatestSignalOpenTime: vi.fn(),
  updateKlines: vi.fn(),
  updateIndicatorValues: vi.fn(),
  updateSignals: vi.fn(),
}));

const dbStub = {} as unknown as PrismaClient;

function buildKline(openTime: number): Kline {
  return {
    openTime: BigInt(openTime),
    open: "100",
    high: "100",
    low: "100",
    close: "100",
    volume: "1",
    closeTime: BigInt(openTime + 99),
    quoteAssetVolume: "1",
    numberOfTrades: 1,
    takerBuyBaseAssetVolume: "1",
    takerBuyQuoteAssetVolume: "1",
  };
}

function buildKlineRow(openTime: number): KlineRow {
  return {
    symbol: "BTCUSDT",
    interval: "1h",
    openTime: BigInt(openTime),
    open: "100",
    high: "100",
    low: "100",
    close: "100",
    volume: "1",
    closeTime: BigInt(openTime + 99),
    quoteAssetVolume: "1",
    numberOfTrades: 1,
    takerBuyBaseAssetVolume: "1",
    takerBuyQuoteAssetVolume: "1",
  };
}

function buildIndicatorValueRow(openTime: number): IndicatorValueRow {
  return {
    symbol: "BTCUSDT",
    interval: "1h",
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
  };
}

function buildDependencies(
  overrides: Partial<HourlyDependencies> = {},
): HourlyDependencies {
  return {
    db: dbStub,
    binance: { listKlines: vi.fn().mockResolvedValue([buildKline(100)]) },
    now: vi.fn(() => 1_000),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listActiveSymbols).mockResolvedValue(["BTCUSDT"]);
  vi.mocked(getLatestKlineOpenTime).mockResolvedValue(null);
  vi.mocked(listKlinesAfter).mockResolvedValue([buildKlineRow(100)]);
  vi.mocked(getLatestIndicatorValueOpenTime).mockResolvedValue(null);
  vi.mocked(getIndicatorValueRow).mockResolvedValue(null);
  vi.mocked(listIndicatorValuesAfter).mockResolvedValue([
    buildIndicatorValueRow(100),
  ]);
  vi.mocked(getLatestSignalOpenTime).mockResolvedValue(null);
  vi.mocked(updateKlines).mockResolvedValue(undefined);
  vi.mocked(updateIndicatorValues).mockResolvedValue(undefined);
  vi.mocked(updateSignals).mockResolvedValue(undefined);
});

describe("main", () => {
  it("空の DB では起点 0 から取得し、fetch・compute・signal の順で書き込む", async () => {
    const writes: string[] = [];
    vi.mocked(updateKlines).mockImplementation(async () => {
      writes.push("klines");
    });
    vi.mocked(updateIndicatorValues).mockImplementation(async () => {
      writes.push("indicatorValues");
    });
    vi.mocked(updateSignals).mockImplementation(async () => {
      writes.push("signals");
    });
    const dependencies = buildDependencies();

    await main(dependencies);

    expect(dependencies.binance.listKlines).toHaveBeenCalledWith(
      "BTCUSDT",
      "1h",
      0n,
    );
    expect(writes.slice(0, 3)).toEqual([
      "klines",
      "indicatorValues",
      "signals",
    ]);
  });

  it("各ステップが自身の出力テーブルの最新 openTime を起点に使う", async () => {
    vi.mocked(getLatestKlineOpenTime).mockResolvedValue(5000n);
    vi.mocked(getLatestIndicatorValueOpenTime).mockResolvedValue(4000n);
    vi.mocked(getIndicatorValueRow).mockResolvedValue(
      buildIndicatorValueRow(4000),
    );
    vi.mocked(listKlinesAfter).mockResolvedValue([
      buildKlineRow(3100),
      buildKlineRow(4100),
    ]);
    vi.mocked(getLatestSignalOpenTime).mockResolvedValue(3000n);
    vi.mocked(listIndicatorValuesAfter).mockResolvedValue([
      buildIndicatorValueRow(3100),
    ]);
    const dependencies = buildDependencies();

    await main(dependencies);

    expect(dependencies.binance.listKlines).toHaveBeenCalledWith(
      "BTCUSDT",
      "1h",
      5000n,
    );
    expect(vi.mocked(listKlinesAfter)).toHaveBeenNthCalledWith(
      1,
      dbStub,
      "BTCUSDT",
      "1h",
      4000n,
      199,
    );
    expect(vi.mocked(getIndicatorValueRow)).toHaveBeenCalledWith(
      dbStub,
      "BTCUSDT",
      "1h",
      4000n,
    );
    expect(vi.mocked(listIndicatorValuesAfter)).toHaveBeenNthCalledWith(
      1,
      dbStub,
      "BTCUSDT",
      "1h",
      3000n,
      1,
    );
    expect(vi.mocked(listKlinesAfter)).toHaveBeenNthCalledWith(
      2,
      dbStub,
      "BTCUSDT",
      "1h",
      3000n,
      1,
    );
  });

  it("全銘柄と全インターバルの組み合わせを処理する", async () => {
    vi.mocked(listActiveSymbols).mockResolvedValue(["BTCUSDT", "ETHUSDT"]);
    const dependencies = buildDependencies();

    await main(dependencies);

    expect(vi.mocked(updateKlines)).toHaveBeenCalledTimes(6);
    expect(vi.mocked(updateIndicatorValues)).toHaveBeenCalledTimes(6);
    expect(vi.mocked(updateSignals)).toHaveBeenCalledTimes(6);
    expect(dependencies.binance.listKlines).toHaveBeenCalledWith(
      "ETHUSDT",
      "1d",
      0n,
    );
  });

  it("系列の失敗を隔離して残りを継続し、最後に失敗を集約した例外を投げる", async () => {
    vi.mocked(updateKlines).mockRejectedValueOnce(new Error("書き込みに失敗"));
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const dependencies = buildDependencies();

    await expect(main(dependencies)).rejects.toThrow(
      "一部の系列の更新に失敗しました(BTCUSDT 1h)。ログを確認してください。",
    );

    expect(dependencies.binance.listKlines).toHaveBeenCalledTimes(3);
    expect(vi.mocked(updateKlines)).toHaveBeenCalledTimes(3);
    expect(vi.mocked(updateIndicatorValues)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(updateSignals)).toHaveBeenCalledTimes(2);
    consoleError.mockRestore();
  });

  it("生成時刻は実行全体で一度だけ取得し、全 signals 行で同一になる", async () => {
    const dependencies = buildDependencies();

    await main(dependencies);

    expect(dependencies.now).toHaveBeenCalledTimes(1);
    const generatedAtValues = vi
      .mocked(updateSignals)
      .mock.calls.map((call) => call[1][0]?.generatedAt?.getTime());
    expect(new Set(generatedAtValues)).toEqual(new Set([1000]));
  });
});
