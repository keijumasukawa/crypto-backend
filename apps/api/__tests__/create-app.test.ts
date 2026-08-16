import {
  getLatestKlineCloseTime,
  listIndicatorValues,
  listKlines,
  listLatestSignals,
  listSignals,
  listSymbols,
  type PrismaClient,
} from "db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/create-app.js";

vi.mock("db", () => ({
  getLatestKlineCloseTime: vi.fn(),
  listIndicatorValues: vi.fn(),
  listKlines: vi.fn(),
  listLatestSignals: vi.fn(),
  listSignals: vi.fn(),
  listSymbols: vi.fn(),
}));

const NOW = 1_786_500_000_000;
const HOUR_MILLISECONDS = 60 * 60 * 1000;
const dbStub = {} as unknown as PrismaClient;

type HealthResponse = {
  status: string;
  latestDataAt: Record<string, number | null>;
  serverTime: number;
};

const API_KEY = "test-key";

function buildApp() {
  return createApp({ db: dbStub, now: () => NOW, apiKey: API_KEY });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/health", () => {
  it("全インターバルのデータが新しい場合は ok を返す", async () => {
    vi.mocked(getLatestKlineCloseTime).mockResolvedValue(
      BigInt(NOW - HOUR_MILLISECONDS),
    );

    const response = await buildApp().request("/api/health");

    expect(response.status).toBe(200);
    const body = (await response.json()) as HealthResponse;
    expect(body.status).toBe("ok");
    expect(body.latestDataAt).toEqual({
      "1h": NOW - HOUR_MILLISECONDS,
      "4h": NOW - HOUR_MILLISECONDS,
      "1d": NOW - HOUR_MILLISECONDS,
    });
    expect(body.serverTime).toBe(NOW);
  });

  it("1h が 2 時間以上遅れている場合は stale を返す", async () => {
    vi.mocked(getLatestKlineCloseTime).mockImplementation(
      async (_db, interval) =>
        interval === "1h"
          ? BigInt(NOW - 2 * HOUR_MILLISECONDS)
          : BigInt(NOW - HOUR_MILLISECONDS),
    );

    const response = await buildApp().request("/api/health");

    const body = (await response.json()) as HealthResponse;
    expect(body.status).toBe("stale");
  });

  it("データが無い場合は stale と null を返す", async () => {
    vi.mocked(getLatestKlineCloseTime).mockResolvedValue(null);

    const response = await buildApp().request("/api/health");

    const body = (await response.json()) as HealthResponse;
    expect(body.status).toBe("stale");
    expect(body.latestDataAt).toEqual({ "1h": null, "4h": null, "1d": null });
  });
});

describe("ルーティング", () => {
  it("認証済みでも未定義のルートは 404 を返す", async () => {
    const response = await buildApp().request("/api/unknown", {
      headers: { "x-api-key": API_KEY },
    });

    expect(response.status).toBe(404);
  });
});

describe("API キー認証", () => {
  function buildProtectedApp() {
    const app = buildApp();
    app.get("/api/protected", (c) => c.json({ ok: true }));
    return app;
  }

  it("/api/health はキーなしでも通る", async () => {
    vi.mocked(getLatestKlineCloseTime).mockResolvedValue(BigInt(NOW));

    const response = await buildApp().request("/api/health");

    expect(response.status).toBe(200);
  });

  it("保護ルートはキーなしで 401 になる", async () => {
    const response = await buildProtectedApp().request("/api/protected");

    expect(response.status).toBe(401);
  });

  it("誤ったキーは長さが違っても 401 になる", async () => {
    const shortKey = await buildProtectedApp().request("/api/protected", {
      headers: { "x-api-key": "wrong" },
    });
    const longKey = await buildProtectedApp().request("/api/protected", {
      headers: { "x-api-key": "test-key-with-extra-length" },
    });

    expect(shortKey.status).toBe(401);
    expect(longKey.status).toBe(401);
  });

  it("正しいキーで通過する", async () => {
    const response = await buildProtectedApp().request("/api/protected", {
      headers: { "x-api-key": API_KEY },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });
});

describe("GET /api/symbols", () => {
  it("認証済みで銘柄一覧をシリアライズ規約どおり返す", async () => {
    vi.mocked(listSymbols).mockResolvedValue([
      {
        symbol: "BNBUSDT",
        baseAsset: "BNB",
        quoteAsset: "USDT",
        onboardDate: new Date("2017-11-06T00:00:00.000Z"),
        isActive: true,
      },
    ]);

    const response = await buildApp().request("/api/symbols", {
      headers: { "x-api-key": API_KEY },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      {
        symbol: "BNBUSDT",
        baseAsset: "BNB",
        quoteAsset: "USDT",
        onboardDate: "2017-11-06T00:00:00.000Z",
        isActive: true,
      },
    ]);
  });

  it("キーなしは 401 になる", async () => {
    const response = await buildApp().request("/api/symbols");

    expect(response.status).toBe(401);
  });
});

describe("GET /api/klines", () => {
  it("認証済みでローソク足一覧をシリアライズ規約どおり返す", async () => {
    vi.mocked(listKlines).mockResolvedValue([
      {
        symbol: "BTCUSDT",
        interval: "1h",
        openTime: 1_700_000_000_000n,
        open: "100",
        high: "110.5",
        low: "99",
        close: "105.25",
        volume: "12.5",
        closeTime: 1_700_003_599_999n,
        quoteAssetVolume: "1300",
        numberOfTrades: 42,
        takerBuyBaseAssetVolume: "6",
        takerBuyQuoteAssetVolume: "630",
      },
    ]);

    const response = await buildApp().request(
      "/api/klines?symbol=BTCUSDT&interval=1h",
      { headers: { "x-api-key": API_KEY } },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      {
        symbol: "BTCUSDT",
        interval: "1h",
        openTime: 1_700_000_000_000,
        open: "100.0000000000",
        high: "110.5000000000",
        low: "99.0000000000",
        close: "105.2500000000",
        volume: "12.5000000000",
        closeTime: 1_700_003_599_999,
        quoteAssetVolume: "1300.0000000000",
        numberOfTrades: 42,
        takerBuyBaseAssetVolume: "6.0000000000",
        takerBuyQuoteAssetVolume: "630.0000000000",
      },
    ]);
    expect(vi.mocked(listKlines)).toHaveBeenCalledWith(
      dbStub,
      "BTCUSDT",
      "1h",
      null,
      null,
      100,
    );
  });

  it("不正なクエリは 400 になる", async () => {
    const response = await buildApp().request("/api/klines?symbol=BTCUSDT", {
      headers: { "x-api-key": API_KEY },
    });

    expect(response.status).toBe(400);
  });

  it("キーなしは 401 になる", async () => {
    const response = await buildApp().request(
      "/api/klines?symbol=BTCUSDT&interval=1h",
    );

    expect(response.status).toBe(401);
  });
});

describe("GET /api/signals", () => {
  it("認証済みでシグナル一覧をシリアライズ規約どおり返す", async () => {
    vi.mocked(listSignals).mockResolvedValue([
      {
        symbol: "BTCUSDT",
        interval: "1d",
        openTime: 1_700_000_000_000n,
        logicVersion: "rule-v1",
        direction: "bullish",
        score: "0.4",
        components: { v: [1, 1, 0, 0, 0], e: 31 },
        generatedAt: new Date("2026-08-06T00:00:00.000Z"),
      },
    ]);

    const response = await buildApp().request(
      "/api/signals?symbol=BTCUSDT&interval=1d",
      { headers: { "x-api-key": API_KEY } },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      {
        symbol: "BTCUSDT",
        interval: "1d",
        openTime: 1_700_000_000_000,
        logicVersion: "rule-v1",
        direction: "bullish",
        score: "0.4000000000",
        components: { v: [1, 1, 0, 0, 0], e: 31 },
        generatedAt: "2026-08-06T00:00:00.000Z",
      },
    ]);
    expect(vi.mocked(listSignals)).toHaveBeenCalledWith(
      dbStub,
      "BTCUSDT",
      "1d",
      "rule-v1",
      100,
    );
  });

  it("不正なクエリは 400 になる", async () => {
    const response = await buildApp().request("/api/signals?symbol=BTCUSDT", {
      headers: { "x-api-key": API_KEY },
    });

    expect(response.status).toBe(400);
  });

  it("キーなしは 401 になる", async () => {
    const response = await buildApp().request(
      "/api/signals?symbol=BTCUSDT&interval=1d",
    );

    expect(response.status).toBe(401);
  });
});

describe("GET /api/signals/latest", () => {
  it("認証済みで全銘柄の最新シグナルをシリアライズ規約どおり返す", async () => {
    vi.mocked(listLatestSignals).mockResolvedValue([
      {
        symbol: "BTCUSDT",
        interval: "1d",
        openTime: 1_700_000_000_000n,
        logicVersion: "rule-v1",
        direction: "neutral",
        score: "0.2",
        components: { v: [1, 0, 0, 0, 0], e: 31 },
        generatedAt: new Date("2026-08-06T00:00:00.000Z"),
      },
    ]);

    const response = await buildApp().request(
      "/api/signals/latest?interval=1d",
      {
        headers: { "x-api-key": API_KEY },
      },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      {
        symbol: "BTCUSDT",
        interval: "1d",
        openTime: 1_700_000_000_000,
        logicVersion: "rule-v1",
        direction: "neutral",
        score: "0.2000000000",
        components: { v: [1, 0, 0, 0, 0], e: 31 },
        generatedAt: "2026-08-06T00:00:00.000Z",
      },
    ]);
    expect(vi.mocked(listLatestSignals)).toHaveBeenCalledWith(
      dbStub,
      "1d",
      "rule-v1",
    );
  });

  it("不正なクエリは 400 になる", async () => {
    const response = await buildApp().request("/api/signals/latest", {
      headers: { "x-api-key": API_KEY },
    });

    expect(response.status).toBe(400);
  });

  it("キーなしは 401 になる", async () => {
    const response = await buildApp().request(
      "/api/signals/latest?interval=1d",
    );

    expect(response.status).toBe(401);
  });
});

describe("GET /api/indicator-values", () => {
  it("認証済みで指標値一覧を状態カラムを除いて返す", async () => {
    vi.mocked(listIndicatorValues).mockResolvedValue([
      {
        symbol: "BTCUSDT",
        interval: "1h",
        openTime: 1_700_000_000_000n,
        sma20: "100.5",
        sma50: null,
        sma200: null,
        ema12: "101",
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
      },
    ]);

    const response = await buildApp().request(
      "/api/indicator-values?symbol=BTCUSDT&interval=1h",
      { headers: { "x-api-key": API_KEY } },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      {
        symbol: "BTCUSDT",
        interval: "1h",
        openTime: 1_700_000_000_000,
        sma20: "100.5000000000",
        sma50: null,
        sma200: null,
        ema12: "101.0000000000",
        ema26: null,
        rsi14: "66.6666666667",
        macd: null,
        macdSignal: null,
        macdHist: null,
        bbUpper: null,
        bbMiddle: null,
        bbLower: null,
      },
    ]);
    expect(vi.mocked(listIndicatorValues)).toHaveBeenCalledWith(
      dbStub,
      "BTCUSDT",
      "1h",
      null,
      null,
      100,
    );
  });

  it("不正なクエリは 400 になる", async () => {
    const response = await buildApp().request(
      "/api/indicator-values?symbol=BTCUSDT",
      { headers: { "x-api-key": API_KEY } },
    );

    expect(response.status).toBe(400);
  });

  it("キーなしは 401 になる", async () => {
    const response = await buildApp().request(
      "/api/indicator-values?symbol=BTCUSDT&interval=1h",
    );

    expect(response.status).toBe(401);
  });
});
