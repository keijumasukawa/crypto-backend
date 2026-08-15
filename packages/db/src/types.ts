import type { Prisma } from "../generated/prisma/client.ts";

export type { PrismaClient } from "../generated/prisma/client.ts";

export type SqlExecutor = {
  $executeRaw: (query: Prisma.Sql) => Promise<number>;
};

export type KlineRow = {
  symbol: string;
  interval: string;
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

export type IndicatorValueRow = {
  symbol: string;
  interval: string;
  openTime: bigint;
  sma20: string | null;
  sma50: string | null;
  sma200: string | null;
  ema12: string | null;
  ema26: string | null;
  rsi14: string | null;
  macd: string | null;
  macdSignal: string | null;
  macdHist: string | null;
  bbUpper: string | null;
  bbMiddle: string | null;
  bbLower: string | null;
  rsiAvgGain14: string | null;
  rsiAvgLoss14: string | null;
};

export type SignalRow = {
  symbol: string;
  interval: string;
  openTime: bigint;
  logicVersion: string;
  direction: string;
  score: string;
  components: unknown;
  generatedAt: Date;
};

export type SymbolRecord = {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  onboardDate: Date;
  isActive: boolean;
};
