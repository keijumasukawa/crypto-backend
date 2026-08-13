import { z } from "zod";

export const KLINE_INTERVALS = ["1h", "4h", "1d"] as const;

export type KlineInterval = (typeof KLINE_INTERVALS)[number];

export type Kline = {
  openTime: bigint;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  closeTime: bigint;
  quoteAssetVolume: string;
  numberOfTrades: number;
  takerBuyBaseAssetVolume: string;
  takerBuyQuoteAssetVolume: string;
};

export type BinanceClient = {
  listKlines: (
    symbol: string,
    interval: KlineInterval,
    startTime: bigint,
  ) => Promise<Kline[]>;
};

export type BinanceClientDependencies = {
  fetch?: typeof globalThis.fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
  baseUrl?: string;
};

const DEFAULT_BASE_URL = "https://data-api.binance.vision";
const KLINES_PATH = "/api/v3/klines";
const EXCHANGE_INFO_PATH = "/api/v3/exchangeInfo";
const MAX_KLINES_PER_REQUEST = 1000;
const WEIGHT_USAGE_LIMIT_RATIO = 0.8;
const MAX_RETRY_COUNT = 3;
const RETRY_BACKOFF_MILLISECONDS = [1000, 2000, 4000];
const FALLBACK_BACKOFF_MILLISECONDS = 4000;
const MINUTE_MILLISECONDS = 60000;
const USED_WEIGHT_HEADER = "x-mbx-used-weight-1m";

const klineTupleSchema = z.tuple([
  z.number(),
  z.string(),
  z.string(),
  z.string(),
  z.string(),
  z.string(),
  z.number(),
  z.string(),
  z.number(),
  z.string(),
  z.string(),
  z.string(),
]);

const klinesResponseSchema = z.array(klineTupleSchema);

const exchangeInfoSchema = z.object({
  rateLimits: z.array(
    z.object({
      rateLimitType: z.string(),
      interval: z.string(),
      intervalNum: z.number(),
      limit: z.number(),
    }),
  ),
});

type KlineTuple = z.infer<typeof klineTupleSchema>;

function convertToKline(tuple: KlineTuple): Kline {
  return {
    openTime: BigInt(tuple[0]),
    open: tuple[1],
    high: tuple[2],
    low: tuple[3],
    close: tuple[4],
    volume: tuple[5],
    closeTime: BigInt(tuple[6]),
    quoteAssetVolume: tuple[7],
    numberOfTrades: tuple[8],
    takerBuyBaseAssetVolume: tuple[9],
    takerBuyQuoteAssetVolume: tuple[10],
  };
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

export function createBinanceClient(
  dependencies: BinanceClientDependencies = {},
): BinanceClient {
  const fetchFn = dependencies.fetch ?? globalThis.fetch;
  const sleep = dependencies.sleep ?? defaultSleep;
  const now = dependencies.now ?? Date.now;
  const baseUrl = dependencies.baseUrl ?? DEFAULT_BASE_URL;

  let weightLimit: number | null = null;

  async function throttleByUsedWeight(response: Response): Promise<void> {
    if (weightLimit === null) {
      return;
    }
    const usedWeightHeader = response.headers.get(USED_WEIGHT_HEADER);
    if (usedWeightHeader === null) {
      return;
    }
    const usedWeight = Number(usedWeightHeader);
    if (Number.isNaN(usedWeight)) {
      return;
    }
    if (usedWeight >= weightLimit * WEIGHT_USAGE_LIMIT_RATIO) {
      await sleep(MINUTE_MILLISECONDS - (now() % MINUTE_MILLISECONDS));
    }
  }

  async function requestJson(
    path: string,
    searchParams: Record<string, string>,
  ): Promise<unknown> {
    const url = new URL(path, baseUrl);
    for (const [key, value] of Object.entries(searchParams)) {
      url.searchParams.set(key, value);
    }

    let retryCount = 0;
    for (;;) {
      const response = await fetchFn(url);
      if (response.status === 418) {
        throw new Error(
          "Binance へのアクセスが制限されているため中断しました。時間をおいて再度お試しください。",
        );
      }
      if (response.status === 429) {
        if (retryCount >= MAX_RETRY_COUNT) {
          throw new Error(
            "Binance の混雑が続いたため中断しました。時間をおいて再度お試しください。",
          );
        }
        const retryAfter = response.headers.get("retry-after");
        const waitMilliseconds =
          retryAfter === null
            ? (RETRY_BACKOFF_MILLISECONDS[retryCount] ??
              FALLBACK_BACKOFF_MILLISECONDS)
            : Number(retryAfter) * 1000;
        retryCount += 1;
        await sleep(waitMilliseconds);
        continue;
      }
      if (!response.ok) {
        throw new Error(
          "Binance からデータを取得できませんでした。時間をおいて再度お試しください。",
        );
      }
      const body: unknown = await response.json();
      await throttleByUsedWeight(response);
      return body;
    }
  }

  async function ensureWeightLimit(): Promise<void> {
    if (weightLimit !== null) {
      return;
    }
    const body = await requestJson(EXCHANGE_INFO_PATH, {});
    const exchangeInfo = exchangeInfoSchema.parse(body);
    const requestWeight = exchangeInfo.rateLimits.find(
      (rateLimit) =>
        rateLimit.rateLimitType === "REQUEST_WEIGHT" &&
        rateLimit.interval === "MINUTE" &&
        rateLimit.intervalNum === 1,
    );
    if (requestWeight === undefined) {
      throw new Error(
        "Binance からレート制限の情報を取得できませんでした。時間をおいて再度お試しください。",
      );
    }
    weightLimit = requestWeight.limit;
  }

  async function listKlines(
    symbol: string,
    interval: KlineInterval,
    startTime: bigint,
  ): Promise<Kline[]> {
    await ensureWeightLimit();

    const klines: Kline[] = [];
    let cursor = startTime;
    for (;;) {
      const body = await requestJson(KLINES_PATH, {
        symbol,
        interval,
        startTime: cursor.toString(),
        limit: String(MAX_KLINES_PER_REQUEST),
      });
      const rows = klinesResponseSchema.parse(body);
      if (rows.length === 0) {
        break;
      }
      const currentTime = now();
      for (const row of rows) {
        if (row[6] < currentTime) {
          klines.push(convertToKline(row));
        }
      }
      if (rows.length < MAX_KLINES_PER_REQUEST) {
        break;
      }
      const lastRow = rows[rows.length - 1];
      if (lastRow === undefined) {
        break;
      }
      cursor = BigInt(lastRow[0]) + 1n;
    }
    return klines;
  }

  return { listKlines };
}
