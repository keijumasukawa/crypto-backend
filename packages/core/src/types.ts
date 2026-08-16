import type { Decimal } from "./decimal.js";

export const KLINE_INTERVALS = ["1h", "4h", "1d"] as const;

export type KlineInterval = (typeof KLINE_INTERVALS)[number];

export type BollingerBands = {
  upper: Decimal;
  middle: Decimal;
  lower: Decimal;
};

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

export type SignalInput = {
  close: Decimal;
  sma50: Decimal | null;
  sma200: Decimal | null;
  rsi14: Decimal | null;
  macdHist: Decimal | null;
  bbUpper: Decimal | null;
  bbLower: Decimal | null;
};

export type PreviousSignalInput = {
  close: Decimal | null;
  sma50: Decimal | null;
  sma200: Decimal | null;
  rsi14: Decimal | null;
  macdHist: Decimal | null;
  bbUpper: Decimal | null;
  bbLower: Decimal | null;
};

export type SignalDirection = "bullish" | "bearish" | "neutral";

export type RuleResult = -1 | 0 | 1;

export type SignalRuleId =
  "maTrend" | "maCross" | "rsiRecross" | "macdReversal" | "bollingerReversion";

export type SignalRule = {
  id: SignalRuleId;
  value: RuleResult;
  weight: number;
  evaluable: boolean;
};

export type SignalComponents = {
  rules: SignalRule[];
  evaluableCount: number;
};

export type Signal = {
  direction: SignalDirection;
  score: Decimal;
  components: SignalComponents;
};

export type StoredSignalComponents = {
  v: RuleResult[];
  e: number;
};

export type ExpandedSignalRule = {
  value: RuleResult;
  evaluable: boolean;
};

export type ExpandedSignalComponents = Record<
  SignalRuleId,
  ExpandedSignalRule
> & {
  evaluableCount: number;
};
