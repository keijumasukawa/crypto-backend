import { Decimal, roundDecimal } from "./decimal.ts";
import { calculateEma } from "./ema.ts";

export type MacdState = {
  shortEma: Decimal;
  longEma: Decimal;
  signalEma: Decimal;
};

export type MacdValue = {
  macd: Decimal | null;
  macdSignal: Decimal | null;
  macdHist: Decimal | null;
};

export function calculateMacd(
  closes: Decimal[],
  shortPeriod: number,
  longPeriod: number,
  signalPeriod: number,
  previousState?: MacdState,
): MacdValue[] {
  if (shortPeriod >= longPeriod) {
    throw new Error("shortPeriod は longPeriod より小さくする");
  }

  const shortEmas = calculateEma(closes, shortPeriod, previousState?.shortEma);
  const longEmas = calculateEma(closes, longPeriod, previousState?.longEma);

  const values: MacdValue[] = closes.map((_, index) => {
    const shortEma = shortEmas[index];
    const longEma = longEmas[index];
    const hasBothEmas =
      shortEma !== null &&
      shortEma !== undefined &&
      longEma !== null &&
      longEma !== undefined;
    return {
      macd: hasBothEmas ? roundDecimal(shortEma.minus(longEma)) : null,
      macdSignal: null,
      macdHist: null,
    };
  });

  const macdSeries: Decimal[] = [];
  const macdPositions: number[] = [];
  for (const [index, value] of values.entries()) {
    if (value.macd !== null) {
      macdSeries.push(value.macd);
      macdPositions.push(index);
    }
  }

  const signalEmas = calculateEma(
    macdSeries,
    signalPeriod,
    previousState?.signalEma,
  );

  for (const [seriesIndex, signalEma] of signalEmas.entries()) {
    const position = macdPositions[seriesIndex];
    if (signalEma === null || position === undefined) {
      continue;
    }
    const value = values[position];
    if (value === undefined || value.macd === null) {
      continue;
    }
    value.macdSignal = signalEma;
    value.macdHist = roundDecimal(value.macd.minus(signalEma));
  }

  return values;
}
