import type { KlineInterval } from "core";
import type { PrismaClient } from "db";

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

export type HourlyDependencies = {
  db: PrismaClient;
  binance: BinanceClient;
  now: () => number;
};
