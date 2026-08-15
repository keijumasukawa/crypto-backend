import {
  calculateBollingerBands,
  calculateEma,
  calculateMacd,
  calculateRsi,
  calculateSma,
  convertToDecimal,
  Decimal,
  type BollingerBands,
  type MacdState,
  type MacdValue,
  type RsiState,
  type RsiValue,
} from "core";
import type { IndicatorValueRow, KlineRow } from "db";

const SMA_SHORT_PERIOD = 20;
const SMA_MIDDLE_PERIOD = 50;
const SMA_LONG_PERIOD = 200;
const BB_PERIOD = 20;
const BB_MULTIPLIER = 2;
const EMA_SHORT_PERIOD = 12;
const EMA_LONG_PERIOD = 26;
const MACD_SIGNAL_PERIOD = 9;
const RSI_PERIOD = 14;

function buildEmaSeries(
  closes: Decimal[],
  newStartIndex: number,
  period: number,
  previousEma: Decimal | null,
): (Decimal | null)[] {
  if (previousEma !== null) {
    return calculateEma(closes.slice(newStartIndex), period, previousEma);
  }
  return calculateEma(closes, period).slice(newStartIndex);
}

function buildMacdSeries(
  closes: Decimal[],
  newStartIndex: number,
  previousState: MacdState | null,
): MacdValue[] {
  if (previousState !== null) {
    return calculateMacd(
      closes.slice(newStartIndex),
      EMA_SHORT_PERIOD,
      EMA_LONG_PERIOD,
      MACD_SIGNAL_PERIOD,
      previousState,
    );
  }
  return calculateMacd(
    closes,
    EMA_SHORT_PERIOD,
    EMA_LONG_PERIOD,
    MACD_SIGNAL_PERIOD,
  ).slice(newStartIndex);
}

function buildRsiSeries(
  closes: Decimal[],
  newStartIndex: number,
  previousState: RsiState | null,
): (RsiValue | null)[] {
  if (previousState !== null) {
    return calculateRsi(closes.slice(newStartIndex), RSI_PERIOD, previousState);
  }
  return calculateRsi(closes, RSI_PERIOD).slice(newStartIndex);
}

export function buildIndicatorValueRows(
  klines: KlineRow[],
  afterOpenTime: bigint | null,
  previousState: IndicatorValueRow | null,
): IndicatorValueRow[] {
  const newStartIndex =
    afterOpenTime === null
      ? 0
      : klines.findIndex((kline) => kline.openTime > afterOpenTime);
  if (newStartIndex === -1 || klines.length === 0) {
    return [];
  }

  const closes = klines.map((kline) => new Decimal(kline.close));

  const sma20Series = calculateSma(closes, SMA_SHORT_PERIOD).slice(
    newStartIndex,
  );
  const sma50Series = calculateSma(closes, SMA_MIDDLE_PERIOD).slice(
    newStartIndex,
  );
  const sma200Series = calculateSma(closes, SMA_LONG_PERIOD).slice(
    newStartIndex,
  );
  const bbSeries: (BollingerBands | null)[] = calculateBollingerBands(
    closes,
    BB_PERIOD,
    BB_MULTIPLIER,
  ).slice(newStartIndex);

  const previousEmaShort = convertToDecimal(previousState?.ema12 ?? null);
  const previousEmaLong = convertToDecimal(previousState?.ema26 ?? null);
  const previousMacdSignal = convertToDecimal(
    previousState?.macdSignal ?? null,
  );
  const previousAvgGain = convertToDecimal(previousState?.rsiAvgGain14 ?? null);
  const previousAvgLoss = convertToDecimal(previousState?.rsiAvgLoss14 ?? null);
  const boundaryClose =
    newStartIndex > 0 ? (closes[newStartIndex - 1] ?? null) : null;

  const emaShortSeries = buildEmaSeries(
    closes,
    newStartIndex,
    EMA_SHORT_PERIOD,
    previousEmaShort,
  );
  const emaLongSeries = buildEmaSeries(
    closes,
    newStartIndex,
    EMA_LONG_PERIOD,
    previousEmaLong,
  );

  const macdState: MacdState | null =
    previousEmaShort !== null &&
    previousEmaLong !== null &&
    previousMacdSignal !== null
      ? {
          shortEma: previousEmaShort,
          longEma: previousEmaLong,
          signalEma: previousMacdSignal,
        }
      : null;
  const macdSeries = buildMacdSeries(closes, newStartIndex, macdState);

  const rsiState: RsiState | null =
    previousAvgGain !== null &&
    previousAvgLoss !== null &&
    boundaryClose !== null
      ? {
          avgGain: previousAvgGain,
          avgLoss: previousAvgLoss,
          previousClose: boundaryClose,
        }
      : null;
  const rsiSeries = buildRsiSeries(closes, newStartIndex, rsiState);

  return klines.slice(newStartIndex).map((kline, index) => ({
    symbol: kline.symbol,
    interval: kline.interval,
    openTime: kline.openTime,
    sma20: sma20Series[index]?.toString() ?? null,
    sma50: sma50Series[index]?.toString() ?? null,
    sma200: sma200Series[index]?.toString() ?? null,
    ema12: emaShortSeries[index]?.toString() ?? null,
    ema26: emaLongSeries[index]?.toString() ?? null,
    rsi14: rsiSeries[index]?.rsi.toString() ?? null,
    macd: macdSeries[index]?.macd?.toString() ?? null,
    macdSignal: macdSeries[index]?.macdSignal?.toString() ?? null,
    macdHist: macdSeries[index]?.macdHist?.toString() ?? null,
    bbUpper: bbSeries[index]?.upper.toString() ?? null,
    bbMiddle: bbSeries[index]?.middle.toString() ?? null,
    bbLower: bbSeries[index]?.lower.toString() ?? null,
    rsiAvgGain14: rsiSeries[index]?.avgGain.toString() ?? null,
    rsiAvgLoss14: rsiSeries[index]?.avgLoss.toString() ?? null,
  }));
}
