import { Decimal, roundDecimal } from "./decimal.ts";

export type BollingerBands = {
  upper: Decimal;
  middle: Decimal;
  lower: Decimal;
};

export function calculateBollingerBands(
  closes: Decimal[],
  period: number,
  multiplier: number,
): (BollingerBands | null)[] {
  if (!Number.isInteger(period) || period < 1) {
    throw new Error("period は 1 以上の整数とする");
  }
  if (!Number.isFinite(multiplier) || multiplier <= 0) {
    throw new Error("multiplier は正の数とする");
  }

  const multiplierDecimal = new Decimal(multiplier);

  return closes.map((_, index) => {
    if (index < period - 1) {
      return null;
    }

    const window = closes.slice(index - period + 1, index + 1);
    const mean = window
      .reduce((sum, close) => sum.plus(close), new Decimal(0))
      .div(period);
    const variance = window
      .reduce(
        (sum, close) => sum.plus(close.minus(mean).pow(2)),
        new Decimal(0),
      )
      .div(period);
    const bandOffset = variance.sqrt().times(multiplierDecimal);

    return {
      upper: roundDecimal(mean.plus(bandOffset)),
      middle: roundDecimal(mean),
      lower: roundDecimal(mean.minus(bandOffset)),
    };
  });
}
