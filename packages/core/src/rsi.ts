import { Decimal, roundDecimal } from "./decimal.ts";

export type RsiState = {
  avgGain: Decimal;
  avgLoss: Decimal;
  previousClose: Decimal;
};

export type RsiValue = {
  rsi: Decimal;
  avgGain: Decimal;
  avgLoss: Decimal;
};

const MAX_RSI = new Decimal(100);
const MIN_RSI = new Decimal(0);

function calculateRsiFromAverages(avgGain: Decimal, avgLoss: Decimal): Decimal {
  if (avgLoss.isZero()) {
    return MAX_RSI;
  }
  if (avgGain.isZero()) {
    return MIN_RSI;
  }
  const rs = avgGain.div(avgLoss);
  return roundDecimal(MAX_RSI.minus(MAX_RSI.div(rs.plus(1))));
}

export function calculateRsi(
  closes: Decimal[],
  period: number,
  previousState?: RsiState,
): (RsiValue | null)[] {
  if (!Number.isInteger(period) || period < 1) {
    throw new Error("period は 1 以上の整数とする");
  }

  const values: (RsiValue | null)[] = [];
  let avgGain = previousState?.avgGain ?? null;
  let avgLoss = previousState?.avgLoss ?? null;
  let previousClose = previousState?.previousClose ?? null;
  let gainSum = new Decimal(0);
  let lossSum = new Decimal(0);
  let changeCount = 0;

  for (const close of closes) {
    if (previousClose === null) {
      previousClose = close;
      values.push(null);
      continue;
    }

    const change = close.minus(previousClose);
    previousClose = close;
    const gain = change.greaterThan(0) ? change : new Decimal(0);
    const loss = change.lessThan(0) ? change.negated() : new Decimal(0);

    if (avgGain === null || avgLoss === null) {
      gainSum = gainSum.plus(gain);
      lossSum = lossSum.plus(loss);
      changeCount += 1;
      if (changeCount === period) {
        avgGain = roundDecimal(gainSum.div(period));
        avgLoss = roundDecimal(lossSum.div(period));
        values.push({
          rsi: calculateRsiFromAverages(avgGain, avgLoss),
          avgGain,
          avgLoss,
        });
      } else {
        values.push(null);
      }
      continue;
    }

    avgGain = roundDecimal(
      avgGain
        .times(period - 1)
        .plus(gain)
        .div(period),
    );
    avgLoss = roundDecimal(
      avgLoss
        .times(period - 1)
        .plus(loss)
        .div(period),
    );
    values.push({
      rsi: calculateRsiFromAverages(avgGain, avgLoss),
      avgGain,
      avgLoss,
    });
  }

  return values;
}
