import { describe, expect, it } from "vitest";
import { calculateRsi, type RsiValue } from "../src/rsi.ts";
import { buildFixtureCloses, convertToDecimals } from "./helpers.ts";

function convertToStrings(values: (RsiValue | null)[]) {
  return values.map((value) =>
    value === null
      ? null
      : {
          rsi: value.rsi.toString(),
          avgGain: value.avgGain.toString(),
          avgLoss: value.avgLoss.toString(),
        },
  );
}

describe("calculateRsi", () => {
  it("既知データと一致する(期間 2)", () => {
    const closes = convertToDecimals(["1", "3", "2", "5"]);
    expect(convertToStrings(calculateRsi(closes, 2))).toEqual([
      null,
      null,
      { rsi: "66.6666666667", avgGain: "1", avgLoss: "0.5" },
      { rsi: "88.8888888889", avgGain: "2", avgLoss: "0.25" },
    ]);
  });

  it("上昇のみの系列は RSI 100 とする(avgLoss = 0)", () => {
    const closes = convertToDecimals(["1", "2", "3"]);
    expect(calculateRsi(closes, 2)[2]?.rsi.toString()).toBe("100");
  });

  it("下落のみの系列は RSI 0 とする(avgGain = 0)", () => {
    const closes = convertToDecimals(["3", "2", "1"]);
    expect(calculateRsi(closes, 2)[2]?.rsi.toString()).toBe("0");
  });

  it("変化のない系列は RSI 100 とする(avgGain と avgLoss がともに 0)", () => {
    const closes = convertToDecimals(["5", "5", "5"]);
    expect(calculateRsi(closes, 2)[2]?.rsi.toString()).toBe("100");
  });

  it("全期間の計算と前回状態からの増分計算が任意の分割点で一致する", () => {
    const period = 14;
    const closes = buildFixtureCloses(60);
    const wholeSeries = calculateRsi(closes, period);
    for (let split = 40; split <= 50; split += 1) {
      const state = wholeSeries[split - 1];
      const previousClose = closes[split - 1];
      expect(state).not.toBeNull();
      if (
        state === null ||
        state === undefined ||
        previousClose === undefined
      ) {
        return;
      }
      const continuation = calculateRsi(closes.slice(split), period, {
        avgGain: state.avgGain,
        avgLoss: state.avgLoss,
        previousClose,
      });
      expect(convertToStrings(continuation)).toEqual(
        convertToStrings(wholeSeries.slice(split)),
      );
    }
  });

  it("標準パラメータ(期間 14)で定義開始位置が正しい", () => {
    const closes = convertToDecimals(
      Array.from({ length: 16 }, (_, index) => String(index + 1)),
    );
    const values = calculateRsi(closes, 14);
    expect(values[13]).toBeNull();
    expect(values[14]).not.toBeNull();
    expect(values[15]).not.toBeNull();
  });

  it("期間に満たない系列はすべて null とする", () => {
    const closes = convertToDecimals(["1", "2"]);
    expect(calculateRsi(closes, 2)).toEqual([null, null]);
  });

  it("空の系列には空の結果を返す", () => {
    expect(calculateRsi([], 14)).toEqual([]);
  });

  it("期間が 1 未満または整数でない場合は例外とする", () => {
    const closes = convertToDecimals(["1"]);
    expect(() => calculateRsi(closes, 0)).toThrow();
    expect(() => calculateRsi(closes, 1.5)).toThrow();
  });
});
