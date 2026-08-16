import {
  convertToExpandedComponents,
  Decimal,
  DECIMAL_PLACES,
  isStoredSignalComponents,
  RULE_V1_LOGIC_VERSION,
} from "core";
import type { IndicatorValueRow, KlineRow, SignalRow, SymbolRecord } from "db";
import type {
  IndicatorValueResponse,
  KlineResponse,
  SignalResponse,
  SymbolResponse,
} from "./types.js";

export function formatDecimal(value: string): string {
  return new Decimal(value).toFixed(DECIMAL_PLACES);
}

function formatNullableDecimal(value: string | null): string | null {
  return value === null ? null : formatDecimal(value);
}

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

export function convertToSymbolResponse(record: SymbolRecord): SymbolResponse {
  return {
    symbol: record.symbol,
    baseAsset: record.baseAsset,
    quoteAsset: record.quoteAsset,
    onboardDate: record.onboardDate.toISOString(),
    isActive: record.isActive,
  };
}

function convertComponents(logicVersion: string, components: unknown): unknown {
  if (
    logicVersion === RULE_V1_LOGIC_VERSION &&
    isStoredSignalComponents(components)
  ) {
    return convertToExpandedComponents(components);
  }
  return components;
}

export function convertToSignalResponse(row: SignalRow): SignalResponse {
  return {
    symbol: row.symbol,
    interval: row.interval,
    openTime: Number(row.openTime),
    logicVersion: row.logicVersion,
    direction: row.direction,
    score: formatDecimal(row.score),
    components: convertComponents(row.logicVersion, row.components),
    generatedAt: row.generatedAt.toISOString(),
  };
}
