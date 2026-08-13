import { Decimal, roundDecimal } from "./decimal.ts";

export function calculateSma(
  closes: Decimal[],
  period: number,
): (Decimal | null)[] {
  if (!Number.isInteger(period) || period < 1) {
    throw new Error("period は 1 以上の整数とする");
  }

  const values: (Decimal | null)[] = [];
  let windowSum = new Decimal(0);

  for (const [index, close] of closes.entries()) {
    windowSum = windowSum.plus(close);
    const removedClose = closes[index - period];
    if (removedClose !== undefined) {
      windowSum = windowSum.minus(removedClose);
    }
    values.push(
      index >= period - 1 ? roundDecimal(windowSum.div(period)) : null,
    );
  }

  return values;
}
