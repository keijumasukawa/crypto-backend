import type { KlineInterval } from "core";
import type { PrismaClient } from "db";

export type ApiDependencies = {
  db: PrismaClient;
  now: () => number;
  apiKey: string;
};

export type SeriesQuery = {
  symbol: string;
  interval: KlineInterval;
  startTime: bigint | null;
  endTime: bigint | null;
  limit: number;
};

export type SeriesQueryResult =
  { isValid: true; query: SeriesQuery } | { isValid: false; message: string };

export type SignalQuery = {
  symbol: string;
  interval: KlineInterval;
  logicVersion: string;
  startTime: bigint | null;
  endTime: bigint | null;
  limit: number;
};

export type SignalQueryResult =
  { isValid: true; query: SignalQuery } | { isValid: false; message: string };

export type LatestSignalQuery = {
  interval: KlineInterval;
  logicVersion: string;
};

export type LatestSignalQueryResult =
  | { isValid: true; query: LatestSignalQuery }
  | { isValid: false; message: string };

export type KlineResponse = {
  symbol: string;
  interval: string;
  openTime: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  closeTime: number;
  quoteAssetVolume: string;
  numberOfTrades: number;
  takerBuyBaseAssetVolume: string;
  takerBuyQuoteAssetVolume: string;
};

export type IndicatorValueResponse = {
  symbol: string;
  interval: string;
  openTime: number;
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
};

export type SymbolResponse = {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  onboardDate: string;
  isActive: boolean;
};

export type SignalResponse = {
  symbol: string;
  interval: string;
  openTime: number;
  logicVersion: string;
  direction: string;
  score: string;
  components: unknown;
  generatedAt: string;
};
