import { describe, expect, it } from "vitest";
import { Decimal } from "../src/decimal.ts";
import {
  calculateRuleV1Signal,
  convertToStoredComponents,
  type PreviousSignalInput,
  type SignalInput,
  type SignalRule,
  type SignalRuleId,
} from "../src/rule-v1.ts";

function buildInput(overrides: Partial<SignalInput> = {}): SignalInput {
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

function buildNullPrevious(): PreviousSignalInput {
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

function getRule(
  previous: PreviousSignalInput,
  current: SignalInput,
  id: SignalRuleId,
): SignalRule {
  const rule = calculateRuleV1Signal(previous, current).components.rules.find(
    (candidate) => candidate.id === id,
  );
  if (rule === undefined) {
    throw new Error("ルールが見つからない");
  }
  return rule;
}

function buildDecimal(value: string): Decimal {
  return new Decimal(value);
}

describe("calculateRuleV1Signal", () => {
  it("ルール①: 終値 > SMA50 > SMA200 で +1、逆順で -1、混在で 0 とする", () => {
    const previous = buildNullPrevious();
    expect(
      getRule(
        previous,
        buildInput({
          close: buildDecimal("110"),
          sma50: buildDecimal("105"),
          sma200: buildDecimal("100"),
        }),
        "maTrend",
      ).value,
    ).toBe(1);
    expect(
      getRule(
        previous,
        buildInput({
          close: buildDecimal("90"),
          sma50: buildDecimal("95"),
          sma200: buildDecimal("100"),
        }),
        "maTrend",
      ).value,
    ).toBe(-1);
    expect(
      getRule(
        previous,
        buildInput({
          close: buildDecimal("110"),
          sma50: buildDecimal("100"),
          sma200: buildDecimal("105"),
        }),
        "maTrend",
      ).value,
    ).toBe(0);
  });

  it("ルール②: ゴールデンクロスの瞬間のみ +1、デッドクロスの瞬間のみ -1 とする", () => {
    const goldenPrevious = {
      ...buildNullPrevious(),
      sma50: buildDecimal("99"),
      sma200: buildDecimal("100"),
    };
    const goldenCurrent = buildInput({
      sma50: buildDecimal("101"),
      sma200: buildDecimal("100"),
    });
    expect(getRule(goldenPrevious, goldenCurrent, "maCross").value).toBe(1);

    const deadPrevious = {
      ...buildNullPrevious(),
      sma50: buildDecimal("101"),
      sma200: buildDecimal("100"),
    };
    const deadCurrent = buildInput({
      sma50: buildDecimal("99"),
      sma200: buildDecimal("100"),
    });
    expect(getRule(deadPrevious, deadCurrent, "maCross").value).toBe(-1);

    const holdPrevious = {
      ...buildNullPrevious(),
      sma50: buildDecimal("101"),
      sma200: buildDecimal("100"),
    };
    const holdCurrent = buildInput({
      sma50: buildDecimal("102"),
      sma200: buildDecimal("100"),
    });
    expect(getRule(holdPrevious, holdCurrent, "maCross").value).toBe(0);
  });

  it("ルール③: RSI 30 の上抜けで +1、70 の下抜けで -1、境界に達しない場合は 0 とする", () => {
    const previous = { ...buildNullPrevious(), rsi14: buildDecimal("28") };
    const current = buildInput({ rsi14: buildDecimal("35") });
    expect(getRule(previous, current, "rsiRecross").value).toBe(1);

    const overboughtPrevious = {
      ...buildNullPrevious(),
      rsi14: buildDecimal("75"),
    };
    const overboughtCurrent = buildInput({ rsi14: buildDecimal("65") });
    expect(
      getRule(overboughtPrevious, overboughtCurrent, "rsiRecross").value,
    ).toBe(-1);

    const flatPrevious = { ...buildNullPrevious(), rsi14: buildDecimal("40") };
    const flatCurrent = buildInput({ rsi14: buildDecimal("50") });
    expect(getRule(flatPrevious, flatCurrent, "rsiRecross").value).toBe(0);
  });

  it("ルール④: ヒストグラムの 0 上抜けで +1、0 下抜けで -1、符号維持で 0 とする", () => {
    const bullishPrevious = {
      ...buildNullPrevious(),
      macdHist: buildDecimal("-1"),
    };
    const bullishCurrent = buildInput({ macdHist: buildDecimal("1") });
    expect(getRule(bullishPrevious, bullishCurrent, "macdReversal").value).toBe(
      1,
    );

    const bearishPrevious = {
      ...buildNullPrevious(),
      macdHist: buildDecimal("1"),
    };
    const bearishCurrent = buildInput({ macdHist: buildDecimal("-1") });
    expect(getRule(bearishPrevious, bearishCurrent, "macdReversal").value).toBe(
      -1,
    );

    const holdPrevious = {
      ...buildNullPrevious(),
      macdHist: buildDecimal("1"),
    };
    const holdCurrent = buildInput({ macdHist: buildDecimal("2") });
    expect(getRule(holdPrevious, holdCurrent, "macdReversal").value).toBe(0);
  });

  it("ルール⑤: 下バンドへの回帰で +1、上バンドへの回帰で -1 とする", () => {
    const bullishPrevious = {
      ...buildNullPrevious(),
      close: buildDecimal("80"),
      bbUpper: buildDecimal("120"),
      bbLower: buildDecimal("85"),
    };
    const bullishCurrent = buildInput({
      close: buildDecimal("90"),
      bbUpper: buildDecimal("120"),
      bbLower: buildDecimal("86"),
    });
    expect(
      getRule(bullishPrevious, bullishCurrent, "bollingerReversion").value,
    ).toBe(1);

    const bearishPrevious = {
      ...buildNullPrevious(),
      close: buildDecimal("125"),
      bbUpper: buildDecimal("120"),
      bbLower: buildDecimal("85"),
    };
    const bearishCurrent = buildInput({
      close: buildDecimal("115"),
      bbUpper: buildDecimal("119"),
      bbLower: buildDecimal("86"),
    });
    expect(
      getRule(bearishPrevious, bearishCurrent, "bollingerReversion").value,
    ).toBe(-1);
  });

  it("必要な指標が NULL のルールは 0(中立)かつ評価不能とする", () => {
    const previous = buildNullPrevious();
    const current = buildInput();

    const signal = calculateRuleV1Signal(previous, current);

    for (const rule of signal.components.rules) {
      expect(rule.value).toBe(0);
      expect(rule.evaluable).toBe(false);
    }
    expect(signal.direction).toBe("neutral");
    expect(signal.components.evaluableCount).toBe(0);
  });

  it("系列最初の足(全フィールド NULL の前足)ではルール①のみ評価される", () => {
    const previous = buildNullPrevious();
    const current = buildInput({
      close: buildDecimal("110"),
      sma50: buildDecimal("105"),
      sma200: buildDecimal("100"),
      rsi14: buildDecimal("60"),
      macdHist: buildDecimal("1"),
      bbUpper: buildDecimal("120"),
      bbLower: buildDecimal("90"),
    });

    const signal = calculateRuleV1Signal(previous, current);

    const maTrend = signal.components.rules.find(
      (rule) => rule.id === "maTrend",
    );
    expect(maTrend?.evaluable).toBe(true);
    expect(maTrend?.value).toBe(1);
    for (const rule of signal.components.rules) {
      if (rule.id !== "maTrend") {
        expect(rule.evaluable).toBe(false);
        expect(rule.value).toBe(0);
      }
    }
    expect(signal.components.evaluableCount).toBe(1);
    expect(signal.direction).toBe("neutral");
  });

  it("前足の終値のみ NULL の場合、ルール⑤は評価不能とする", () => {
    const previous = {
      ...buildNullPrevious(),
      bbUpper: buildDecimal("120"),
      bbLower: buildDecimal("85"),
    };
    const current = buildInput({
      bbUpper: buildDecimal("120"),
      bbLower: buildDecimal("86"),
    });

    const rule = getRule(previous, current, "bollingerReversion");

    expect(rule.evaluable).toBe(false);
    expect(rule.value).toBe(0);
  });

  it("2 ルール点灯でスコア 0.4 となり bullish と判定する", () => {
    const previous = { ...buildNullPrevious(), rsi14: buildDecimal("28") };
    const current = buildInput({
      close: buildDecimal("110"),
      sma50: buildDecimal("105"),
      sma200: buildDecimal("100"),
      rsi14: buildDecimal("35"),
    });

    const signal = calculateRuleV1Signal(previous, current);

    expect(signal.score.toString()).toBe("0.4");
    expect(signal.direction).toBe("bullish");
  });

  it("1 ルール点灯のみのスコア 0.2 は neutral と判定する", () => {
    const previous = buildNullPrevious();
    const current = buildInput({
      close: buildDecimal("110"),
      sma50: buildDecimal("105"),
      sma200: buildDecimal("100"),
    });

    const signal = calculateRuleV1Signal(previous, current);

    expect(signal.score.toString()).toBe("0.2");
    expect(signal.direction).toBe("neutral");
  });

  it("弱気 2 ルール点灯でスコア -0.4 となり bearish と判定する", () => {
    const previous = { ...buildNullPrevious(), rsi14: buildDecimal("75") };
    const current = buildInput({
      close: buildDecimal("90"),
      sma50: buildDecimal("95"),
      sma200: buildDecimal("100"),
      rsi14: buildDecimal("65"),
    });

    const signal = calculateRuleV1Signal(previous, current);

    expect(signal.score.toString()).toBe("-0.4");
    expect(signal.direction).toBe("bearish");
  });

  it("全ルール点灯でスコア 1 となり evaluableCount は 5 になる", () => {
    const previous: PreviousSignalInput = {
      close: buildDecimal("80"),
      sma50: buildDecimal("100"),
      sma200: buildDecimal("101"),
      rsi14: buildDecimal("28"),
      macdHist: buildDecimal("-1"),
      bbUpper: buildDecimal("120"),
      bbLower: buildDecimal("85"),
    };
    const current = buildInput({
      close: buildDecimal("110"),
      sma50: buildDecimal("105"),
      sma200: buildDecimal("100"),
      rsi14: buildDecimal("35"),
      macdHist: buildDecimal("1"),
      bbUpper: buildDecimal("130"),
      bbLower: buildDecimal("90"),
    });

    const signal = calculateRuleV1Signal(previous, current);

    expect(signal.score.toString()).toBe("1");
    expect(signal.direction).toBe("bullish");
    expect(signal.components.evaluableCount).toBe(5);
  });

  it("components のルールは定義順に並び、判定値と重みを含む", () => {
    const previous = buildNullPrevious();
    const current = buildInput();

    const signal = calculateRuleV1Signal(previous, current);

    expect(signal.components.rules.map((rule) => rule.id)).toEqual([
      "maTrend",
      "maCross",
      "rsiRecross",
      "macdReversal",
      "bollingerReversion",
    ]);
    for (const rule of signal.components.rules) {
      expect(rule.weight).toBe(1);
    }
  });
});

describe("convertToStoredComponents", () => {
  it("判定値を配列に、評価可能性をビットマスクに変換する", () => {
    const previous: PreviousSignalInput = {
      close: buildDecimal("80"),
      sma50: buildDecimal("100"),
      sma200: buildDecimal("101"),
      rsi14: buildDecimal("28"),
      macdHist: buildDecimal("-1"),
      bbUpper: buildDecimal("120"),
      bbLower: buildDecimal("85"),
    };
    const current = buildInput({
      close: buildDecimal("110"),
      sma50: buildDecimal("105"),
      sma200: buildDecimal("100"),
      rsi14: buildDecimal("35"),
      macdHist: buildDecimal("1"),
      bbUpper: buildDecimal("130"),
      bbLower: buildDecimal("90"),
    });

    const signal = calculateRuleV1Signal(previous, current);
    const stored = convertToStoredComponents(signal.components);

    expect(stored).toEqual({ v: [1, 1, 1, 1, 1], e: 31 });
  });

  it("ルール①のみ評価可能な場合はビットマスクが 1 になる", () => {
    const previous = buildNullPrevious();
    const current = buildInput({
      close: buildDecimal("110"),
      sma50: buildDecimal("105"),
      sma200: buildDecimal("100"),
    });

    const signal = calculateRuleV1Signal(previous, current);
    const stored = convertToStoredComponents(signal.components);

    expect(stored).toEqual({ v: [1, 0, 0, 0, 0], e: 1 });
  });

  it("全ルール評価不能の場合はビットマスクが 0 になる", () => {
    const signal = calculateRuleV1Signal(buildNullPrevious(), buildInput());

    const stored = convertToStoredComponents(signal.components);

    expect(stored).toEqual({ v: [0, 0, 0, 0, 0], e: 0 });
  });
});
