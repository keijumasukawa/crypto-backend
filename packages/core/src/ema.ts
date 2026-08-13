import { Decimal, roundDecimal } from "./decimal.ts";

export function calculateEma(
  closes: Decimal[],
  period: number,
  previousEma?: Decimal,
): (Decimal | null)[] {
  if (!Number.isInteger(period) || period < 1) {
    throw new Error("period は 1 以上の整数とする");
  }

  const smoothingFactor = new Decimal(2).div(period + 1);
  const values: (Decimal | null)[] = [];
  let currentEma = previousEma ?? null;
  let initialSum = new Decimal(0);

  for (const [index, close] of closes.entries()) {
    if (currentEma === null) {
      initialSum = initialSum.plus(close);
      if (index === period - 1) {
        currentEma = roundDecimal(initialSum.div(period));
        values.push(currentEma);
      } else {
        values.push(null);
      }
    } else {
      currentEma = roundDecimal(
        currentEma.plus(smoothingFactor.times(close.minus(currentEma))),
      );
      values.push(currentEma);
    }
  }

  return values;
}
