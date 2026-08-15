import { Decimal, DECIMAL_PLACES } from "core";
import type { IndicatorValueRow, KlineRow, SignalRow } from "db";

export function formatDecimal(value: string): string {
  return new Decimal(value).toFixed(DECIMAL_PLACES);
}

function formatNullableDecimal(value: string | null): string | null {
  return value === null ? null : formatDecimal(value);
}

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

export function convertToKlineResponse(row: KlineRow): KlineResponse {
  return {
    symbol: row.symbol,
    interval: row.interval,
    openTime: Number(row.openTime),
    open: formatDecimal(row.open),
    high: formatDecimal(row.high),
    low: formatDecimal(row.low),
    close: formatDecimal(row.close),
    volume: formatDecimal(row.volume),
    closeTime: Number(row.closeTime),
    quoteAssetVolume: formatDecimal(row.quoteAssetVolume),
    numberOfTrades: row.numberOfTrades,
    takerBuyBaseAssetVolume: formatDecimal(row.takerBuyBaseAssetVolume),
    takerBuyQuoteAssetVolume: formatDecimal(row.takerBuyQuoteAssetVolume),
  };
}

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

export function convertToIndicatorValueResponse(
  row: IndicatorValueRow,
): IndicatorValueResponse {
  return {
    symbol: row.symbol,
    interval: row.interval,
    openTime: Number(row.openTime),
    sma20: formatNullableDecimal(row.sma20),
    sma50: formatNullableDecimal(row.sma50),
    sma200: formatNullableDecimal(row.sma200),
    ema12: formatNullableDecimal(row.ema12),
    ema26: formatNullableDecimal(row.ema26),
    rsi14: formatNullableDecimal(row.rsi14),
    macd: formatNullableDecimal(row.macd),
    macdSignal: formatNullableDecimal(row.macdSignal),
    macdHist: formatNullableDecimal(row.macdHist),
    bbUpper: formatNullableDecimal(row.bbUpper),
    bbMiddle: formatNullableDecimal(row.bbMiddle),
    bbLower: formatNullableDecimal(row.bbLower),
  };
}

export type SymbolRecord = {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  onboardDate: Date;
  isActive: boolean;
};

export type SymbolResponse = {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  onboardDate: string;
  isActive: boolean;
};

export function convertToSymbolResponse(record: SymbolRecord): SymbolResponse {
  return {
    symbol: record.symbol,
    baseAsset: record.baseAsset,
    quoteAsset: record.quoteAsset,
    onboardDate: record.onboardDate.toISOString(),
    isActive: record.isActive,
  };
}

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

export function convertToSignalResponse(row: SignalRow): SignalResponse {
  return {
    symbol: row.symbol,
    interval: row.interval,
    openTime: Number(row.openTime),
    logicVersion: row.logicVersion,
    direction: row.direction,
    score: formatDecimal(row.score),
    components: row.components,
    generatedAt: row.generatedAt.toISOString(),
  };
}
