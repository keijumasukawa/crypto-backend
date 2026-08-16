import { Decimal, roundDecimal } from "./decimal.js";
import type {
  ExpandedSignalComponents,
  ExpandedSignalRule,
  PreviousSignalInput,
  RuleResult,
  Signal,
  SignalComponents,
  SignalDirection,
  SignalInput,
  SignalRule,
  SignalRuleId,
  StoredSignalComponents,
} from "./types.js";

export const RULE_V1_LOGIC_VERSION = "rule-v1";

const RULE_IDS: readonly SignalRuleId[] = [
  "maTrend",
  "maCross",
  "rsiRecross",
  "macdReversal",
  "bollingerReversion",
];

const RULE_WEIGHT = 1;
const RSI_OVERSOLD = 30;
const RSI_OVERBOUGHT = 70;
const BULLISH_THRESHOLD = new Decimal("0.3");
const BEARISH_THRESHOLD = BULLISH_THRESHOLD.negated();

type RuleEvaluation = {
  value: RuleResult;
  evaluable: boolean;
};

const UNEVALUABLE: RuleEvaluation = { value: 0, evaluable: false };

function calculateMaTrend(current: SignalInput): RuleEvaluation {
  if (current.sma50 === null || current.sma200 === null) {
    return UNEVALUABLE;
  }
  if (
    current.close.greaterThan(current.sma50) &&
    current.sma50.greaterThan(current.sma200)
  ) {
    return { value: 1, evaluable: true };
  }
  if (
    current.close.lessThan(current.sma50) &&
    current.sma50.lessThan(current.sma200)
  ) {
    return { value: -1, evaluable: true };
  }
  return { value: 0, evaluable: true };
}

function calculateMaCross(
  previous: PreviousSignalInput,
  current: SignalInput,
): RuleEvaluation {
  if (
    previous.sma50 === null ||
    previous.sma200 === null ||
    current.sma50 === null ||
    current.sma200 === null
  ) {
    return UNEVALUABLE;
  }
  if (
    previous.sma50.lessThanOrEqualTo(previous.sma200) &&
    current.sma50.greaterThan(current.sma200)
  ) {
    return { value: 1, evaluable: true };
  }
  if (
    previous.sma50.greaterThanOrEqualTo(previous.sma200) &&
    current.sma50.lessThan(current.sma200)
  ) {
    return { value: -1, evaluable: true };
  }
  return { value: 0, evaluable: true };
}

function calculateRsiRecross(
  previous: PreviousSignalInput,
  current: SignalInput,
): RuleEvaluation {
  if (previous.rsi14 === null || current.rsi14 === null) {
    return UNEVALUABLE;
  }
  if (
    previous.rsi14.lessThan(RSI_OVERSOLD) &&
    current.rsi14.greaterThanOrEqualTo(RSI_OVERSOLD)
  ) {
    return { value: 1, evaluable: true };
  }
  if (
    previous.rsi14.greaterThan(RSI_OVERBOUGHT) &&
    current.rsi14.lessThanOrEqualTo(RSI_OVERBOUGHT)
  ) {
    return { value: -1, evaluable: true };
  }
  return { value: 0, evaluable: true };
}

function calculateMacdReversal(
  previous: PreviousSignalInput,
  current: SignalInput,
): RuleEvaluation {
  if (previous.macdHist === null || current.macdHist === null) {
    return UNEVALUABLE;
  }
  if (
    previous.macdHist.lessThanOrEqualTo(0) &&
    current.macdHist.greaterThan(0)
  ) {
    return { value: 1, evaluable: true };
  }
  if (
    previous.macdHist.greaterThanOrEqualTo(0) &&
    current.macdHist.lessThan(0)
  ) {
    return { value: -1, evaluable: true };
  }
  return { value: 0, evaluable: true };
}

function calculateBollingerReversion(
  previous: PreviousSignalInput,
  current: SignalInput,
): RuleEvaluation {
  if (
    previous.close === null ||
    previous.bbUpper === null ||
    previous.bbLower === null ||
    current.bbUpper === null ||
    current.bbLower === null
  ) {
    return UNEVALUABLE;
  }
  if (
    previous.close.lessThan(previous.bbLower) &&
    current.close.greaterThanOrEqualTo(current.bbLower)
  ) {
    return { value: 1, evaluable: true };
  }
  if (
    previous.close.greaterThan(previous.bbUpper) &&
    current.close.lessThanOrEqualTo(current.bbUpper)
  ) {
    return { value: -1, evaluable: true };
  }
  return { value: 0, evaluable: true };
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
  previous: PreviousSignalInput,
  current: SignalInput,
): Signal {
  const rules: SignalRule[] = [
    { id: "maTrend", weight: RULE_WEIGHT, ...calculateMaTrend(current) },
    {
      id: "maCross",
      weight: RULE_WEIGHT,
      ...calculateMaCross(previous, current),
    },
    {
      id: "rsiRecross",
      weight: RULE_WEIGHT,
      ...calculateRsiRecross(previous, current),
    },
    {
      id: "macdReversal",
      weight: RULE_WEIGHT,
      ...calculateMacdReversal(previous, current),
    },
    {
      id: "bollingerReversion",
      weight: RULE_WEIGHT,
      ...calculateBollingerReversion(previous, current),
    },
  ];

  const weightedSum = rules.reduce(
    (sum, rule) => sum.plus(new Decimal(rule.value).times(rule.weight)),
    new Decimal(0),
  );
  const totalWeight = rules.reduce((sum, rule) => sum + rule.weight, 0);
  const score = roundDecimal(weightedSum.div(totalWeight));
  const evaluableCount = rules.filter((rule) => rule.evaluable).length;

  return {
    direction: calculateDirection(score),
    score,
    components: { rules, evaluableCount },
  };
}

export function convertToStoredComponents(
  components: SignalComponents,
): StoredSignalComponents {
  const values = components.rules.map((rule) => rule.value);
  const bitmask = components.rules.reduce(
    (mask, rule, index) => (rule.evaluable ? mask | (1 << index) : mask),
    0,
  );
  return { v: values, e: bitmask };
}

export function isStoredSignalComponents(
  value: unknown,
): value is StoredSignalComponents {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    Array.isArray(record.v) &&
    record.v.length === RULE_IDS.length &&
    record.v.every((item) => item === -1 || item === 0 || item === 1) &&
    typeof record.e === "number" &&
    Number.isInteger(record.e) &&
    record.e >= 0 &&
    record.e < 1 << RULE_IDS.length
  );
}

export function convertToExpandedComponents(
  stored: StoredSignalComponents,
): ExpandedSignalComponents {
  const rules = Object.fromEntries(
    RULE_IDS.map((id, index) => [
      id,
      {
        value: stored.v[index] ?? 0,
        evaluable: (stored.e & (1 << index)) !== 0,
      },
    ]),
  ) as Record<SignalRuleId, ExpandedSignalRule>;
  const evaluableCount = RULE_IDS.filter(
    (id, index) => (stored.e & (1 << index)) !== 0,
  ).length;
  return { ...rules, evaluableCount };
}
