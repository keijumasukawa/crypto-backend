import { Decimal, roundDecimal } from "./decimal.ts";

export const RULE_V1_LOGIC_VERSION = "rule-v1";

const RULE_WEIGHT = 1;
const RSI_OVERSOLD = 30;
const RSI_OVERBOUGHT = 70;
const BULLISH_THRESHOLD = new Decimal("0.3");
const BEARISH_THRESHOLD = BULLISH_THRESHOLD.negated();

export type SignalInput = {
  close: Decimal;
  sma50: Decimal | null;
  sma200: Decimal | null;
  rsi14: Decimal | null;
  macdHist: Decimal | null;
  bbUpper: Decimal | null;
  bbLower: Decimal | null;
};

export type SignalDirection = "bullish" | "bearish" | "neutral";

export type RuleResult = -1 | 0 | 1;

export type SignalComponent = {
  result: RuleResult;
  weight: number;
};

export type SignalComponents = {
  maTrend: SignalComponent;
  maCross: SignalComponent;
  rsiRecross: SignalComponent;
  macdReversal: SignalComponent;
  bollingerReversion: SignalComponent;
};

export type Signal = {
  direction: SignalDirection;
  score: Decimal;
  components: SignalComponents;
};

function calculateMaTrend(current: SignalInput): RuleResult {
  if (current.sma50 === null || current.sma200 === null) {
    return 0;
  }
  if (
    current.close.greaterThan(current.sma50) &&
    current.sma50.greaterThan(current.sma200)
  ) {
    return 1;
  }
  if (
    current.close.lessThan(current.sma50) &&
    current.sma50.lessThan(current.sma200)
  ) {
    return -1;
  }
  return 0;
}

function calculateMaCross(
  previous: SignalInput,
  current: SignalInput,
): RuleResult {
  if (
    previous.sma50 === null ||
    previous.sma200 === null ||
    current.sma50 === null ||
    current.sma200 === null
  ) {
    return 0;
  }
  if (
    previous.sma50.lessThanOrEqualTo(previous.sma200) &&
    current.sma50.greaterThan(current.sma200)
  ) {
    return 1;
  }
  if (
    previous.sma50.greaterThanOrEqualTo(previous.sma200) &&
    current.sma50.lessThan(current.sma200)
  ) {
    return -1;
  }
  return 0;
}

function calculateRsiRecross(
  previous: SignalInput,
  current: SignalInput,
): RuleResult {
  if (previous.rsi14 === null || current.rsi14 === null) {
    return 0;
  }
  if (
    previous.rsi14.lessThan(RSI_OVERSOLD) &&
    current.rsi14.greaterThanOrEqualTo(RSI_OVERSOLD)
  ) {
    return 1;
  }
  if (
    previous.rsi14.greaterThan(RSI_OVERBOUGHT) &&
    current.rsi14.lessThanOrEqualTo(RSI_OVERBOUGHT)
  ) {
    return -1;
  }
  return 0;
}

function calculateMacdReversal(
  previous: SignalInput,
  current: SignalInput,
): RuleResult {
  if (previous.macdHist === null || current.macdHist === null) {
    return 0;
  }
  if (
    previous.macdHist.lessThanOrEqualTo(0) &&
    current.macdHist.greaterThan(0)
  ) {
    return 1;
  }
  if (
    previous.macdHist.greaterThanOrEqualTo(0) &&
    current.macdHist.lessThan(0)
  ) {
    return -1;
  }
  return 0;
}

function calculateBollingerReversion(
  previous: SignalInput,
  current: SignalInput,
): RuleResult {
  if (
    previous.bbUpper === null ||
    previous.bbLower === null ||
    current.bbUpper === null ||
    current.bbLower === null
  ) {
    return 0;
  }
  if (
    previous.close.lessThan(previous.bbLower) &&
    current.close.greaterThanOrEqualTo(current.bbLower)
  ) {
    return 1;
  }
  if (
    previous.close.greaterThan(previous.bbUpper) &&
    current.close.lessThanOrEqualTo(current.bbUpper)
  ) {
    return -1;
  }
  return 0;
}

function calculateDirection(score: Decimal): SignalDirection {
  if (score.greaterThanOrEqualTo(BULLISH_THRESHOLD)) {
    return "bullish";
  }
  if (score.lessThanOrEqualTo(BEARISH_THRESHOLD)) {
    return "bearish";
  }
  return "neutral";
}

export function calculateRuleV1Signal(
  previous: SignalInput,
  current: SignalInput,
): Signal {
  const components: SignalComponents = {
    maTrend: { result: calculateMaTrend(current), weight: RULE_WEIGHT },
    maCross: {
      result: calculateMaCross(previous, current),
      weight: RULE_WEIGHT,
    },
    rsiRecross: {
      result: calculateRsiRecross(previous, current),
      weight: RULE_WEIGHT,
    },
    macdReversal: {
      result: calculateMacdReversal(previous, current),
      weight: RULE_WEIGHT,
    },
    bollingerReversion: {
      result: calculateBollingerReversion(previous, current),
      weight: RULE_WEIGHT,
    },
  };

  const componentList = Object.values(components);
  const weightedSum = componentList.reduce(
    (sum, component) =>
      sum.plus(new Decimal(component.result).times(component.weight)),
    new Decimal(0),
  );
  const totalWeight = componentList.reduce(
    (sum, component) => sum + component.weight,
    0,
  );
  const score = roundDecimal(weightedSum.div(totalWeight));

  return {
    direction: calculateDirection(score),
    score,
    components,
  };
}
