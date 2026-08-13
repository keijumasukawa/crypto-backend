import { describe, expect, it } from "vitest";
import { Decimal } from "../src/decimal.ts";
import { calculateSma } from "../src/sma.ts";
import { buildFixtureCloses, convertToDecimals } from "./helpers.ts";

function convertToStrings(values: (Decimal | null)[]): (string | null)[] {
  return values.map((value) => (value === null ? null : value.toString()));
}

describe("calculateSma", () => {
  it("既知データと一致する(期間 3)", () => {
    const closes = convertToDecimals(["1", "2", "3", "4", "5"]);
    expect(convertToStrings(calculateSma(closes, 3))).toEqual([
      null,
      null,
      "2",
      "3",
      "4",
    ]);
  });

  it("期間に満たない初期区間は null とする", () => {
    const closes = convertToDecimals(["10", "20", "30", "40"]);
    expect(convertToStrings(calculateSma(closes, 2))).toEqual([
      null,
      "15",
      "25",
      "35",
    ]);
  });

  it("割り切れない平均を小数 10 桁・ROUND_HALF_UP で丸める", () => {
    const closes = convertToDecimals(["1", "2", "2"]);
    expect(convertToStrings(calculateSma(closes, 3))).toEqual([
      null,
      null,
      "1.6666666667",
    ]);
  });

  it("二進浮動小数点で誤差が出る値も正確に平均する", () => {
    const closes = convertToDecimals(["0.1", "0.2", "0.3"]);
    expect(convertToStrings(calculateSma(closes, 3))).toEqual([
      null,
      null,
      "0.2",
    ]);
  });

  it("期間が本数を超える場合はすべて null とする", () => {
    const closes = convertToDecimals(["1", "2"]);
    expect(convertToStrings(calculateSma(closes, 3))).toEqual([null, null]);
  });

  it("空の系列には空の結果を返す", () => {
    expect(calculateSma([], 20)).toEqual([]);
  });

  it("期間 1 は各値をそのまま返す", () => {
    const closes = convertToDecimals(["1.5", "2.5"]);
    expect(convertToStrings(calculateSma(closes, 1))).toEqual(["1.5", "2.5"]);
  });

  it("期間が 1 未満または整数でない場合は例外とする", () => {
    const closes = convertToDecimals(["1"]);
    expect(() => calculateSma(closes, 0)).toThrow();
    expect(() => calculateSma(closes, 1.5)).toThrow();
  });

  it("全期間の計算と窓の不足分を遡った増分計算が任意の分割点で一致する", () => {
    const period = 20;
    const closes = buildFixtureCloses(60);
    const wholeSeries = calculateSma(closes, period);
    for (let split = 40; split <= 50; split += 1) {
      const lookbackStart = split - (period - 1);
      const incremental = calculateSma(closes.slice(lookbackStart), period);
      expect(
        convertToStrings(incremental.slice(split - lookbackStart)),
      ).toEqual(convertToStrings(wholeSeries.slice(split)));
    }
  });
});
