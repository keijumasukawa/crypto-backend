import { describe, expect, it } from "vitest";
import { Decimal } from "../src/decimal.ts";
import { calculateRuleV1Signal, type SignalInput } from "../src/rule-v1.ts";

function buildSignalInput(overrides: Partial<SignalInput> = {}): SignalInput {
  return {
    close: new Decimal("100"),
    sma50: null,
    sma200: null,
    rsi14: null,
    macdHist: null,
    bbUpper: null,
    bbLower: null,
    ...overrides,
  };
}

describe("calculateRuleV1Signal", () => {
  it("ルール①: 終値 > SMA50 > SMA200 で +1、逆順で -1、混在で 0 とする", () => {
    const previous = buildSignalInput();
    const bullish = calculateRuleV1Signal(
      previous,
      buildSignalInput({
        close: new Decimal("110"),
        sma50: new Decimal("105"),
        sma200: new Decimal("100"),
      }),
    );
    expect(bullish.components.maTrend.result).toBe(1);

    const bearish = calculateRuleV1Signal(
      previous,
      buildSignalInput({
        close: new Decimal("90"),
        sma50: new Decimal("95"),
        sma200: new Decimal("100"),
      }),
    );
    expect(bearish.components.maTrend.result).toBe(-1);

    const mixed = calculateRuleV1Signal(
      previous,
      buildSignalInput({
        close: new Decimal("110"),
        sma50: new Decimal("100"),
        sma200: new Decimal("105"),
      }),
    );
    expect(mixed.components.maTrend.result).toBe(0);
  });

  it("ルール②: ゴールデンクロスの瞬間のみ +1、デッドクロスの瞬間のみ -1 とする", () => {
    const goldenCross = calculateRuleV1Signal(
      buildSignalInput({
        sma50: new Decimal("100"),
        sma200: new Decimal("100"),
      }),
      buildSignalInput({
        sma50: new Decimal("101"),
        sma200: new Decimal("100"),
      }),
    );
    expect(goldenCross.components.maCross.result).toBe(1);

    const deadCross = calculateRuleV1Signal(
      buildSignalInput({
        sma50: new Decimal("100"),
        sma200: new Decimal("100"),
      }),
      buildSignalInput({
        sma50: new Decimal("99"),
        sma200: new Decimal("100"),
      }),
    );
    expect(deadCross.components.maCross.result).toBe(-1);

    const continuing = calculateRuleV1Signal(
      buildSignalInput({
        sma50: new Decimal("101"),
        sma200: new Decimal("100"),
      }),
      buildSignalInput({
        sma50: new Decimal("102"),
        sma200: new Decimal("100"),
      }),
    );
    expect(continuing.components.maCross.result).toBe(0);
  });

  it("ルール③: RSI 30 の上抜けで +1、70 の下抜けで -1、境界に達しない場合は 0 とする", () => {
    const oversoldRecovery = calculateRuleV1Signal(
      buildSignalInput({ rsi14: new Decimal("29") }),
      buildSignalInput({ rsi14: new Decimal("30") }),
    );
    expect(oversoldRecovery.components.rsiRecross.result).toBe(1);

    const overboughtFall = calculateRuleV1Signal(
      buildSignalInput({ rsi14: new Decimal("71") }),
      buildSignalInput({ rsi14: new Decimal("70") }),
    );
    expect(overboughtFall.components.rsiRecross.result).toBe(-1);

    const insideRange = calculateRuleV1Signal(
      buildSignalInput({ rsi14: new Decimal("30") }),
      buildSignalInput({ rsi14: new Decimal("50") }),
    );
    expect(insideRange.components.rsiRecross.result).toBe(0);
  });

  it("ルール④: ヒストグラムの 0 上抜けで +1、0 下抜けで -1、符号維持で 0 とする", () => {
    const bullishReversal = calculateRuleV1Signal(
      buildSignalInput({ macdHist: new Decimal("-0.1") }),
      buildSignalInput({ macdHist: new Decimal("0.1") }),
    );
    expect(bullishReversal.components.macdReversal.result).toBe(1);

    const zeroDeparture = calculateRuleV1Signal(
      buildSignalInput({ macdHist: new Decimal("0") }),
      buildSignalInput({ macdHist: new Decimal("0.1") }),
    );
    expect(zeroDeparture.components.macdReversal.result).toBe(1);

    const bearishReversal = calculateRuleV1Signal(
      buildSignalInput({ macdHist: new Decimal("0.1") }),
      buildSignalInput({ macdHist: new Decimal("-0.1") }),
    );
    expect(bearishReversal.components.macdReversal.result).toBe(-1);

    const holding = calculateRuleV1Signal(
      buildSignalInput({ macdHist: new Decimal("0.1") }),
      buildSignalInput({ macdHist: new Decimal("0.2") }),
    );
    expect(holding.components.macdReversal.result).toBe(0);
  });

  it("ルール⑤: 下バンドへの回帰で +1、上バンドへの回帰で -1 とする", () => {
    const lowerReversion = calculateRuleV1Signal(
      buildSignalInput({
        close: new Decimal("94"),
        bbUpper: new Decimal("110"),
        bbLower: new Decimal("95"),
      }),
      buildSignalInput({
        close: new Decimal("96"),
        bbUpper: new Decimal("110"),
        bbLower: new Decimal("95"),
      }),
    );
    expect(lowerReversion.components.bollingerReversion.result).toBe(1);

    const upperReversion = calculateRuleV1Signal(
      buildSignalInput({
        close: new Decimal("111"),
        bbUpper: new Decimal("110"),
        bbLower: new Decimal("95"),
      }),
      buildSignalInput({
        close: new Decimal("109"),
        bbUpper: new Decimal("110"),
        bbLower: new Decimal("95"),
      }),
    );
    expect(upperReversion.components.bollingerReversion.result).toBe(-1);
  });

  it("必要な指標が NULL のルールは 0(中立)とする", () => {
    const signal = calculateRuleV1Signal(
      buildSignalInput(),
      buildSignalInput(),
    );
    expect(signal.components.maTrend.result).toBe(0);
    expect(signal.components.maCross.result).toBe(0);
    expect(signal.components.rsiRecross.result).toBe(0);
    expect(signal.components.macdReversal.result).toBe(0);
    expect(signal.components.bollingerReversion.result).toBe(0);
    expect(signal.score.toString()).toBe("0");
    expect(signal.direction).toBe("neutral");
  });

  it("2 ルール点灯でスコア 0.4 となり bullish と判定する", () => {
    const signal = calculateRuleV1Signal(
      buildSignalInput({
        rsi14: new Decimal("29"),
        macdHist: new Decimal("-0.1"),
      }),
      buildSignalInput({
        rsi14: new Decimal("35"),
        macdHist: new Decimal("0.1"),
      }),
    );
    expect(signal.score.toString()).toBe("0.4");
    expect(signal.direction).toBe("bullish");
  });

  it("1 ルール点灯のみのスコア 0.2 は neutral と判定する", () => {
    const signal = calculateRuleV1Signal(
      buildSignalInput({ rsi14: new Decimal("29") }),
      buildSignalInput({ rsi14: new Decimal("35") }),
    );
    expect(signal.score.toString()).toBe("0.2");
    expect(signal.direction).toBe("neutral");
  });

  it("弱気 2 ルール点灯でスコア -0.4 となり bearish と判定する", () => {
    const signal = calculateRuleV1Signal(
      buildSignalInput({
        rsi14: new Decimal("71"),
        macdHist: new Decimal("0.1"),
      }),
      buildSignalInput({
        rsi14: new Decimal("65"),
        macdHist: new Decimal("-0.1"),
      }),
    );
    expect(signal.score.toString()).toBe("-0.4");
    expect(signal.direction).toBe("bearish");
  });

  it("全ルール点灯でスコア 1 となる", () => {
    const previous = buildSignalInput({
      close: new Decimal("94"),
      sma50: new Decimal("100"),
      sma200: new Decimal("100"),
      rsi14: new Decimal("29"),
      macdHist: new Decimal("-0.1"),
      bbUpper: new Decimal("110"),
      bbLower: new Decimal("95"),
    });
    const current = buildSignalInput({
      close: new Decimal("108"),
      sma50: new Decimal("101"),
      sma200: new Decimal("100"),
      rsi14: new Decimal("35"),
      macdHist: new Decimal("0.1"),
      bbUpper: new Decimal("110"),
      bbLower: new Decimal("95"),
    });
    const signal = calculateRuleV1Signal(previous, current);
    expect(signal.score.toString()).toBe("1");
    expect(signal.direction).toBe("bullish");
  });

  it("components に全ルールの判定値と重みを含む", () => {
    const signal = calculateRuleV1Signal(
      buildSignalInput(),
      buildSignalInput(),
    );
    for (const component of Object.values(signal.components)) {
      expect([-1, 0, 1]).toContain(component.result);
      expect(component.weight).toBe(1);
    }
  });
});
