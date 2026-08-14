import { RULE_V1_LOGIC_VERSION } from "core";
import {
  getIndicatorValueRow,
  getLatestIndicatorValueOpenTime,
  getLatestKlineOpenTime,
  getLatestSignalOpenTime,
  listIndicatorValuesAfter,
  listKlinesAfter,
  updateIndicatorValues,
  updateKlines,
  updateSignals,
  type PrismaClient,
} from "db";
import {
  KLINE_INTERVALS,
  type BinanceClient,
  type KlineInterval,
} from "./binance.ts";
import { buildIndicatorValueRows } from "./indicator-rows.ts";
import { buildKlineRows } from "./kline-rows.ts";
import { buildSignalRows } from "./signal-rows.ts";

const COMPUTE_LOOKBACK_COUNT = 199;
const SIGNAL_LOOKBACK_COUNT = 1;
const BACKFILL_START_TIME = 0n;

export function validateKlineInterval(
  value: string | undefined,
): KlineInterval {
  const interval = KLINE_INTERVALS.find((candidate) => candidate === value);
  if (interval === undefined) {
    throw new Error(
      "インターバルの指定が正しくありません。1h・4h・1d のいずれかを指定してください。",
    );
  }
  return interval;
}

export async function updateSeries(
  db: PrismaClient,
  binance: BinanceClient,
  symbol: string,
  interval: KlineInterval,
  generatedAt: Date,
): Promise<void> {
  const latestKlineOpenTime = await getLatestKlineOpenTime(
    db,
    symbol,
    interval,
  );
  const klines = await binance.listKlines(
    symbol,
    interval,
    latestKlineOpenTime ?? BACKFILL_START_TIME,
  );
  await updateKlines(db, buildKlineRows(symbol, interval, klines));

  const latestIndicatorOpenTime = await getLatestIndicatorValueOpenTime(
    db,
    symbol,
    interval,
  );
  const computeKlines = await listKlinesAfter(
    db,
    symbol,
    interval,
    latestIndicatorOpenTime,
    COMPUTE_LOOKBACK_COUNT,
  );
  const previousState =
    latestIndicatorOpenTime === null
      ? null
      : await getIndicatorValueRow(
          db,
          symbol,
          interval,
          latestIndicatorOpenTime,
        );
  await updateIndicatorValues(
    db,
    buildIndicatorValueRows(
      computeKlines,
      latestIndicatorOpenTime,
      previousState,
    ),
  );

  const latestSignalOpenTime = await getLatestSignalOpenTime(
    db,
    symbol,
    interval,
    RULE_V1_LOGIC_VERSION,
  );
  const indicatorValues = await listIndicatorValuesAfter(
    db,
    symbol,
    interval,
    latestSignalOpenTime,
    SIGNAL_LOOKBACK_COUNT,
  );
  const signalKlines = await listKlinesAfter(
    db,
    symbol,
    interval,
    latestSignalOpenTime,
    SIGNAL_LOOKBACK_COUNT,
  );
  await updateSignals(
    db,
    buildSignalRows(
      indicatorValues,
      signalKlines,
      latestSignalOpenTime,
      generatedAt,
    ),
  );
}
