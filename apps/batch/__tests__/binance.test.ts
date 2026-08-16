import { describe, expect, it } from "vitest";
import { createBinanceClient } from "../src/binance.js";

const EXCHANGE_INFO_BODY = {
  rateLimits: [
    {
      rateLimitType: "REQUEST_WEIGHT",
      interval: "MINUTE",
      intervalNum: 1,
      limit: 6000,
    },
  ],
};

function buildKlineTuple(openTime: number, closeTime: number): unknown {
  return [
    openTime,
    "1",
    "2",
    "0.5",
    "1.5",
    "10",
    closeTime,
    "15",
    3,
    "5",
    "7.5",
    "0",
  ];
}

function buildJsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: init.headers ?? {},
  });
}

function buildFetchStub(responses: Response[]) {
  const requestUrls: URL[] = [];
  const fetchStub: typeof globalThis.fetch = (input) => {
    requestUrls.push(new URL(String(input)));
    const response = responses.shift();
    if (response === undefined) {
      throw new Error("想定外のリクエスト");
    }
    return Promise.resolve(response);
  };
  return { fetchStub, requestUrls };
}

function buildSleepStub() {
  const waits: number[] = [];
  const sleepStub = (milliseconds: number): Promise<void> => {
    waits.push(milliseconds);
    return Promise.resolve();
  };
  return { sleepStub, waits };
}

describe("createBinanceClient", () => {
  it("1,000 本を超える系列をページングで全件取得する", async () => {
    const firstPage = Array.from({ length: 1000 }, (_, index) =>
      buildKlineTuple(index, index + 1),
    );
    const secondPage = Array.from({ length: 500 }, (_, index) =>
      buildKlineTuple(1000 + index, 1001 + index),
    );
    const { fetchStub, requestUrls } = buildFetchStub([
      buildJsonResponse(EXCHANGE_INFO_BODY),
      buildJsonResponse(firstPage),
      buildJsonResponse(secondPage),
    ]);
    const { sleepStub } = buildSleepStub();
    const client = createBinanceClient({
      fetch: fetchStub,
      sleep: sleepStub,
      now: () => 10_000_000,
    });

    const klines = await client.listKlines("BTCUSDT", "1d", 0n);

    expect(klines).toHaveLength(1500);
    expect(klines[0]?.openTime).toBe(0n);
    expect(klines[1499]?.openTime).toBe(1499n);
    expect(requestUrls[1]?.searchParams.get("startTime")).toBe("0");
    expect(requestUrls[2]?.searchParams.get("startTime")).toBe("1000");
  });

  it("未確定足を除外する", async () => {
    const rows = [buildKlineTuple(0, 100), buildKlineTuple(100, 200)];
    const { fetchStub } = buildFetchStub([
      buildJsonResponse(EXCHANGE_INFO_BODY),
      buildJsonResponse(rows),
    ]);
    const { sleepStub } = buildSleepStub();
    const client = createBinanceClient({
      fetch: fetchStub,
      sleep: sleepStub,
      now: () => 150,
    });

    const klines = await client.listKlines("BTCUSDT", "1h", 0n);

    expect(klines).toHaveLength(1);
    expect(klines[0]?.closeTime).toBe(100n);
  });

  it("スキーマに合わないレスポンスは例外とする", async () => {
    const { fetchStub } = buildFetchStub([
      buildJsonResponse(EXCHANGE_INFO_BODY),
      buildJsonResponse([["invalid"]]),
    ]);
    const { sleepStub } = buildSleepStub();
    const client = createBinanceClient({
      fetch: fetchStub,
      sleep: sleepStub,
      now: () => 1000,
    });

    await expect(client.listKlines("BTCUSDT", "1d", 0n)).rejects.toThrow();
  });

  it("429 は Retry-After に従い待機して再試行する", async () => {
    const { fetchStub } = buildFetchStub([
      buildJsonResponse(EXCHANGE_INFO_BODY),
      buildJsonResponse(null, {
        status: 429,
        headers: { "retry-after": "2" },
      }),
      buildJsonResponse([buildKlineTuple(0, 100)]),
    ]);
    const { sleepStub, waits } = buildSleepStub();
    const client = createBinanceClient({
      fetch: fetchStub,
      sleep: sleepStub,
      now: () => 1000,
    });

    const klines = await client.listKlines("BTCUSDT", "1d", 0n);

    expect(klines).toHaveLength(1);
    expect(waits).toEqual([2000]);
  });

  it("429 で Retry-After がない場合は指数バックオフで待機する", async () => {
    const { fetchStub } = buildFetchStub([
      buildJsonResponse(EXCHANGE_INFO_BODY),
      buildJsonResponse(null, { status: 429 }),
      buildJsonResponse(null, { status: 429 }),
      buildJsonResponse(null, { status: 429 }),
      buildJsonResponse([buildKlineTuple(0, 100)]),
    ]);
    const { sleepStub, waits } = buildSleepStub();
    const client = createBinanceClient({
      fetch: fetchStub,
      sleep: sleepStub,
      now: () => 1000,
    });

    const klines = await client.listKlines("BTCUSDT", "1d", 0n);

    expect(klines).toHaveLength(1);
    expect(waits).toEqual([1000, 2000, 4000]);
  });

  it("429 がリトライ上限を超えた場合は失敗する", async () => {
    const { fetchStub } = buildFetchStub([
      buildJsonResponse(EXCHANGE_INFO_BODY),
      buildJsonResponse(null, { status: 429 }),
      buildJsonResponse(null, { status: 429 }),
      buildJsonResponse(null, { status: 429 }),
      buildJsonResponse(null, { status: 429 }),
    ]);
    const { sleepStub } = buildSleepStub();
    const client = createBinanceClient({
      fetch: fetchStub,
      sleep: sleepStub,
      now: () => 1000,
    });

    await expect(client.listKlines("BTCUSDT", "1d", 0n)).rejects.toThrow(
      "混雑",
    );
  });

  it("418 は再試行せず即時中断する", async () => {
    const { fetchStub, requestUrls } = buildFetchStub([
      buildJsonResponse(EXCHANGE_INFO_BODY),
      buildJsonResponse(null, { status: 418 }),
    ]);
    const { sleepStub, waits } = buildSleepStub();
    const client = createBinanceClient({
      fetch: fetchStub,
      sleep: sleepStub,
      now: () => 1000,
    });

    await expect(client.listKlines("BTCUSDT", "1d", 0n)).rejects.toThrow(
      "制限",
    );
    expect(requestUrls).toHaveLength(2);
    expect(waits).toEqual([]);
  });

  it("使用重みが上限の 80% に達したら 1 分枠の残り時間だけ待機する", async () => {
    const { fetchStub } = buildFetchStub([
      buildJsonResponse(EXCHANGE_INFO_BODY),
      buildJsonResponse([buildKlineTuple(0, 100)], {
        headers: { "x-mbx-used-weight-1m": "4800" },
      }),
    ]);
    const { sleepStub, waits } = buildSleepStub();
    const client = createBinanceClient({
      fetch: fetchStub,
      sleep: sleepStub,
      now: () => 100_000,
    });

    await client.listKlines("BTCUSDT", "1d", 0n);

    expect(waits).toEqual([20_000]);
  });

  it("レート制限の上限は初回に一度だけ取得する", async () => {
    const { fetchStub, requestUrls } = buildFetchStub([
      buildJsonResponse(EXCHANGE_INFO_BODY),
      buildJsonResponse([buildKlineTuple(0, 100)]),
      buildJsonResponse([buildKlineTuple(0, 100)]),
    ]);
    const { sleepStub } = buildSleepStub();
    const client = createBinanceClient({
      fetch: fetchStub,
      sleep: sleepStub,
      now: () => 1000,
    });

    await client.listKlines("BTCUSDT", "1d", 0n);
    await client.listKlines("ETHUSDT", "1d", 0n);

    const exchangeInfoRequests = requestUrls.filter(
      (url) => url.pathname === "/api/v3/exchangeInfo",
    );
    expect(exchangeInfoRequests).toHaveLength(1);
  });

  it("実際の Binance API から確定足を取得する", async () => {
    const client = createBinanceClient();
    const startTime = BigInt(Date.now() - 5 * 24 * 60 * 60 * 1000);

    const klines = await client.listKlines("BTCUSDT", "1d", startTime);

    expect(klines.length).toBeGreaterThan(0);
    for (const kline of klines) {
      expect(kline.closeTime < BigInt(Date.now())).toBe(true);
      expect(Number(kline.close)).toBeGreaterThan(0);
    }
  }, 15_000);
});
