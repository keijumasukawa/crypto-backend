import { describe, expect, it } from "vitest";
import { calculateEma } from "../src/ema.ts";
import { calculateMacd, type MacdValue } from "../src/macd.ts";
import { buildFixtureCloses, convertToDecimals } from "./helpers.ts";

function convertToStrings(values: MacdValue[]) {
  return values.map((value) => ({
    macd: value.macd?.toString() ?? null,
    macdSignal: value.macdSignal?.toString() ?? null,
    macdHist: value.macdHist?.toString() ?? null,
  }));
}

describe("calculateMacd", () => {
  it("既知データと一致する(2, 3, 2)", () => {
    const closes = convertToDecimals(["1", "2", "3", "4", "5", "6"]);
    expect(convertToStrings(calculateMacd(closes, 2, 3, 2))).toEqual([
      { macd: null, macdSignal: null, macdHist: null },
      { macd: null, macdSignal: null, macdHist: null },
      { macd: "0.5", macdSignal: null, macdHist: null },
      { macd: "0.5", macdSignal: "0.5", macdHist: "0" },
      { macd: "0.5", macdSignal: "0.5", macdHist: "0" },
      { macd: "0.5", macdSignal: "0.5", macdHist: "0" },
    ]);
  });

  it("シグナル線は macd 系列の最初の N 本の SMA で初期化する", () => {
    const closes = convertToDecimals(["1", "2", "4", "2", "6"]);
    const values = calculateMacd(closes, 2, 3, 2);
    expect(values[2]?.macd?.toString()).toBe("0.8333333334");
    expect(values[3]?.macd?.toString()).toBe("0.2222222222");
    expect(values[3]?.macdSignal?.toString()).toBe("0.5277777778");
  });

  it("標準パラメータ(12, 26, 9)で定義開始位置が正しい", () => {
    const closes = convertToDecimals(
      Array.from({ length: 40 }, (_, index) => String(index + 1)),
    );
    const values = calculateMacd(closes, 12, 26, 9);
    expect(values[24]?.macd).toBeNull();
    expect(values[25]?.macd).not.toBeNull();
    expect(values[32]?.macdSignal).toBeNull();
    expect(values[33]?.macdSignal).not.toBeNull();
    expect(values[33]?.macdHist).not.toBeNull();
  });

  it("全期間の計算と前回状態からの増分計算が任意の分割点で一致する", () => {
    const closes = buildFixtureCloses(60);
    const wholeSeries = calculateMacd(closes, 12, 26, 9);
    const shortEmas = calculateEma(closes, 12);
    const longEmas = calculateEma(closes, 26);
    for (let split = 40; split <= 50; split += 1) {
      const shortEma = shortEmas[split - 1];
      const longEma = longEmas[split - 1];
      const signalEma = wholeSeries[split - 1]?.macdSignal ?? null;
      expect(signalEma).not.toBeNull();
      if (
        shortEma === null ||
        shortEma === undefined ||
        longEma === null ||
        longEma === undefined ||
        signalEma === null
      ) {
        return;
      }
      const continuation = calculateMacd(closes.slice(split), 12, 26, 9, {
        shortEma,
        longEma,
        signalEma,
      });
      expect(convertToStrings(continuation)).toEqual(
        convertToStrings(wholeSeries.slice(split)),
      );
    }
  });

  it("期間に満たない系列はすべて null とする", () => {
    const closes = convertToDecimals(["1", "2"]);
    expect(convertToStrings(calculateMacd(closes, 2, 3, 2))).toEqual([
      { macd: null, macdSignal: null, macdHist: null },
      { macd: null, macdSignal: null, macdHist: null },
    ]);
  });

  it("空の系列には空の結果を返す", () => {
    expect(calculateMacd([], 12, 26, 9)).toEqual([]);
  });

  it("短期が長期以上の場合は例外とする", () => {
    const closes = convertToDecimals(["1"]);
    expect(() => calculateMacd(closes, 26, 12, 9)).toThrow();
    expect(() => calculateMacd(closes, 12, 12, 9)).toThrow();
  });

  it("期間が 1 未満または整数でない場合は例外とする", () => {
    const closes = convertToDecimals(["1"]);
    expect(() => calculateMacd(closes, 2, 3, 0)).toThrow();
    expect(() => calculateMacd(closes, 1.5, 3, 2)).toThrow();
  });
});
