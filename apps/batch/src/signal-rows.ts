import {
  calculateRuleV1Signal,
  convertToStoredComponents,
  Decimal,
  RULE_V1_LOGIC_VERSION,
  type PreviousSignalInput,
  type SignalInput,
} from "core";
import type { IndicatorValueRow, KlineRow, SignalRow } from "db";

function convertToDecimal(value: string | null): Decimal | null {
  return value === null ? null : new Decimal(value);
}

function convertToSignalInput(
  row: IndicatorValueRow,
  close: Decimal,
): SignalInput {
  return {
    close,
    sma50: convertToDecimal(row.sma50),
    sma200: convertToDecimal(row.sma200),
    rsi14: convertToDecimal(row.rsi14),
    macdHist: convertToDecimal(row.macdHist),
    bbUpper: convertToDecimal(row.bbUpper),
    bbLower: convertToDecimal(row.bbLower),
  };
}

function buildInitialPreviousSignalInput(): PreviousSignalInput {
  return {
    close: null,
    sma50: null,
    sma200: null,
    rsi14: null,
    macdHist: null,
    bbUpper: null,
    bbLower: null,
  };
}

export function buildSignalRows(
  indicatorValues: IndicatorValueRow[],
  klines: KlineRow[],
  afterOpenTime: bigint | null,
  generatedAt: Date,
): SignalRow[] {
  const newStartIndex =
    afterOpenTime === null
      ? 0
      : indicatorValues.findIndex((row) => row.openTime > afterOpenTime);
  if (newStartIndex === -1 || indicatorValues.length === 0) {
    return [];
  }

  const closes = new Map<bigint, Decimal>();
  for (const kline of klines) {
    closes.set(kline.openTime, new Decimal(kline.close));
  }

  function getClose(openTime: bigint): Decimal {
    const close = closes.get(openTime);
    if (close === undefined) {
      throw new Error("対応する終値が見つからないため中断しました。");
    }
    return close;
  }

  const rows: SignalRow[] = [];
  for (let index = newStartIndex; index < indicatorValues.length; index += 1) {
    const currentRow = indicatorValues[index];
    if (currentRow === undefined) {
      continue;
    }
    const current = convertToSignalInput(
      currentRow,
      getClose(currentRow.openTime),
    );

    const previousRow = indicatorValues[index - 1];
    const previous: PreviousSignalInput =
      previousRow === undefined
        ? buildInitialPreviousSignalInput()
        : convertToSignalInput(previousRow, getClose(previousRow.openTime));

    const signal = calculateRuleV1Signal(previous, current);
    rows.push({
      symbol: currentRow.symbol,
      interval: currentRow.interval,
      openTime: currentRow.openTime,
      logicVersion: RULE_V1_LOGIC_VERSION,
      direction: signal.direction,
      score: signal.score.toString(),
      components: convertToStoredComponents(signal.components),
      generatedAt,
    });
  }
  return rows;
}
