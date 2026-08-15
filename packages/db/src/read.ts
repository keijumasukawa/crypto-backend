import type { PrismaClient } from "../generated/prisma/client.ts";
import type {
  IndicatorValueRow,
  KlineRow,
  SignalRow,
  SymbolRecord,
} from "./types.ts";

type KlineRecord = {
  symbol: string;
  interval: string;
  openTime: bigint;
  open: { toString: () => string };
  high: { toString: () => string };
  low: { toString: () => string };
  close: { toString: () => string };
  volume: { toString: () => string };
  closeTime: bigint;
  quoteAssetVolume: { toString: () => string };
  numberOfTrades: number;
  takerBuyBaseAssetVolume: { toString: () => string };
  takerBuyQuoteAssetVolume: { toString: () => string };
};

type IndicatorValueRecord = {
  symbol: string;
  interval: string;
  openTime: bigint;
  sma20: { toString: () => string } | null;
  sma50: { toString: () => string } | null;
  sma200: { toString: () => string } | null;
  ema12: { toString: () => string } | null;
  ema26: { toString: () => string } | null;
  rsi14: { toString: () => string } | null;
  macd: { toString: () => string } | null;
  macdSignal: { toString: () => string } | null;
  macdHist: { toString: () => string } | null;
  bbUpper: { toString: () => string } | null;
  bbMiddle: { toString: () => string } | null;
  bbLower: { toString: () => string } | null;
  rsiAvgGain14: { toString: () => string } | null;
  rsiAvgLoss14: { toString: () => string } | null;
};

type SignalRecord = {
  symbol: string;
  interval: string;
  openTime: bigint;
  logicVersion: string;
  direction: string;
  score: { toString: () => string };
  components: unknown;
  generatedAt: Date;
};

function convertToKlineRow(record: KlineRecord): KlineRow {
  return {
    symbol: record.symbol,
    interval: record.interval,
    openTime: record.openTime,
    open: record.open.toString(),
    high: record.high.toString(),
    low: record.low.toString(),
    close: record.close.toString(),
    volume: record.volume.toString(),
    closeTime: record.closeTime,
    quoteAssetVolume: record.quoteAssetVolume.toString(),
    numberOfTrades: record.numberOfTrades,
    takerBuyBaseAssetVolume: record.takerBuyBaseAssetVolume.toString(),
    takerBuyQuoteAssetVolume: record.takerBuyQuoteAssetVolume.toString(),
  };
}

function convertToIndicatorValueRow(
  record: IndicatorValueRecord,
): IndicatorValueRow {
  return {
    symbol: record.symbol,
    interval: record.interval,
    openTime: record.openTime,
    sma20: record.sma20?.toString() ?? null,
    sma50: record.sma50?.toString() ?? null,
    sma200: record.sma200?.toString() ?? null,
    ema12: record.ema12?.toString() ?? null,
    ema26: record.ema26?.toString() ?? null,
    rsi14: record.rsi14?.toString() ?? null,
    macd: record.macd?.toString() ?? null,
    macdSignal: record.macdSignal?.toString() ?? null,
    macdHist: record.macdHist?.toString() ?? null,
    bbUpper: record.bbUpper?.toString() ?? null,
    bbMiddle: record.bbMiddle?.toString() ?? null,
    bbLower: record.bbLower?.toString() ?? null,
    rsiAvgGain14: record.rsiAvgGain14?.toString() ?? null,
    rsiAvgLoss14: record.rsiAvgLoss14?.toString() ?? null,
  };
}

function convertToSignalRow(record: SignalRecord): SignalRow {
  return {
    symbol: record.symbol,
    interval: record.interval,
    openTime: record.openTime,
    logicVersion: record.logicVersion,
    direction: record.direction,
    score: record.score.toString(),
    components: record.components,
    generatedAt: record.generatedAt,
  };
}

export async function listActiveSymbols(db: PrismaClient): Promise<string[]> {
  const symbols = await db.symbol.findMany({
    where: { isActive: true },
    orderBy: { symbol: "asc" },
    select: { symbol: true },
  });
  return symbols.map((record) => record.symbol);
}

export async function listSymbols(db: PrismaClient): Promise<SymbolRecord[]> {
  return db.symbol.findMany({ orderBy: { symbol: "asc" } });
}

export async function getLatestKlineOpenTime(
  db: PrismaClient,
  symbol: string,
  interval: string,
): Promise<bigint | null> {
  const kline = await db.kline.findFirst({
    where: { symbol, interval },
    orderBy: { openTime: "desc" },
    select: { openTime: true },
  });
  return kline?.openTime ?? null;
}

export async function listKlinesAfter(
  db: PrismaClient,
  symbol: string,
  interval: string,
  openTime: bigint | null,
  lookbackCount: number,
): Promise<KlineRow[]> {
  if (openTime === null) {
    const records = await db.kline.findMany({
      where: { symbol, interval },
      orderBy: { openTime: "asc" },
    });
    return records.map(convertToKlineRow);
  }

  const lookbackRecords = await db.kline.findMany({
    where: { symbol, interval, openTime: { lte: openTime } },
    orderBy: { openTime: "desc" },
    take: lookbackCount,
  });
  const newRecords = await db.kline.findMany({
    where: { symbol, interval, openTime: { gt: openTime } },
    orderBy: { openTime: "asc" },
  });
  return [...lookbackRecords.reverse(), ...newRecords].map(convertToKlineRow);
}

export async function listKlines(
  db: PrismaClient,
  symbol: string,
  interval: string,
  startTime: bigint | null,
  endTime: bigint | null,
  limit: number,
): Promise<KlineRow[]> {
  if (startTime === null && endTime === null) {
    const records = await db.kline.findMany({
      where: { symbol, interval },
      orderBy: { openTime: "desc" },
      take: limit,
    });
    return records.reverse().map(convertToKlineRow);
  }

  const records = await db.kline.findMany({
    where: {
      symbol,
      interval,
      openTime: {
        ...(startTime === null ? {} : { gte: startTime }),
        ...(endTime === null ? {} : { lte: endTime }),
      },
    },
    orderBy: { openTime: "asc" },
    take: limit,
  });
  return records.map(convertToKlineRow);
}

export async function getLatestIndicatorValueOpenTime(
  db: PrismaClient,
  symbol: string,
  interval: string,
): Promise<bigint | null> {
  const indicatorValue = await db.indicatorValue.findFirst({
    where: { symbol, interval },
    orderBy: { openTime: "desc" },
    select: { openTime: true },
  });
  return indicatorValue?.openTime ?? null;
}

export async function getIndicatorValueRow(
  db: PrismaClient,
  symbol: string,
  interval: string,
  openTime: bigint,
): Promise<IndicatorValueRow | null> {
  const record = await db.indicatorValue.findUnique({
    where: { symbol_interval_openTime: { symbol, interval, openTime } },
  });
  return record === null ? null : convertToIndicatorValueRow(record);
}

export async function listIndicatorValuesAfter(
  db: PrismaClient,
  symbol: string,
  interval: string,
  openTime: bigint | null,
  lookbackCount: number,
): Promise<IndicatorValueRow[]> {
  if (openTime === null) {
    const records = await db.indicatorValue.findMany({
      where: { symbol, interval },
      orderBy: { openTime: "asc" },
    });
    return records.map(convertToIndicatorValueRow);
  }

  const lookbackRecords = await db.indicatorValue.findMany({
    where: { symbol, interval, openTime: { lte: openTime } },
    orderBy: { openTime: "desc" },
    take: lookbackCount,
  });
  const newRecords = await db.indicatorValue.findMany({
    where: { symbol, interval, openTime: { gt: openTime } },
    orderBy: { openTime: "asc" },
  });
  return [...lookbackRecords.reverse(), ...newRecords].map(
    convertToIndicatorValueRow,
  );
}

export async function listIndicatorValues(
  db: PrismaClient,
  symbol: string,
  interval: string,
  startTime: bigint | null,
  endTime: bigint | null,
  limit: number,
): Promise<IndicatorValueRow[]> {
  if (startTime === null && endTime === null) {
    const records = await db.indicatorValue.findMany({
      where: { symbol, interval },
      orderBy: { openTime: "desc" },
      take: limit,
    });
    return records.reverse().map(convertToIndicatorValueRow);
  }

  const records = await db.indicatorValue.findMany({
    where: {
      symbol,
      interval,
      openTime: {
        ...(startTime === null ? {} : { gte: startTime }),
        ...(endTime === null ? {} : { lte: endTime }),
      },
    },
    orderBy: { openTime: "asc" },
    take: limit,
  });
  return records.map(convertToIndicatorValueRow);
}

export async function getLatestKlineCloseTime(
  db: PrismaClient,
  interval: string,
): Promise<bigint | null> {
  const kline = await db.kline.findFirst({
    where: { interval },
    orderBy: { closeTime: "desc" },
    select: { closeTime: true },
  });
  return kline?.closeTime ?? null;
}

export async function getLatestSignalOpenTime(
  db: PrismaClient,
  symbol: string,
  interval: string,
  logicVersion: string,
): Promise<bigint | null> {
  const signal = await db.signal.findFirst({
    where: { symbol, interval, logicVersion },
    orderBy: { openTime: "desc" },
    select: { openTime: true },
  });
  return signal?.openTime ?? null;
}

export async function listSignals(
  db: PrismaClient,
  symbol: string,
  interval: string,
  logicVersion: string,
  limit: number,
): Promise<SignalRow[]> {
  const records = await db.signal.findMany({
    where: { symbol, interval, logicVersion },
    orderBy: { openTime: "desc" },
    take: limit,
  });
  return records.reverse().map(convertToSignalRow);
}

export async function listLatestSignals(
  db: PrismaClient,
  interval: string,
  logicVersion: string,
): Promise<SignalRow[]> {
  const symbols = await listActiveSymbols(db);
  const rows: SignalRow[] = [];
  for (const symbol of symbols) {
    const record = await db.signal.findFirst({
      where: { symbol, interval, logicVersion },
      orderBy: { openTime: "desc" },
    });
    if (record !== null) {
      rows.push(convertToSignalRow(record));
    }
  }
  return rows;
}
