import { describe, expect, it } from "vitest";
import {
  calculateBollingerBands,
  type BollingerBands,
} from "../src/bollinger-bands.ts";
import { calculateSma } from "../src/sma.ts";
import { buildFixtureCloses, convertToDecimals } from "./helpers.ts";

function convertToStrings(values: (BollingerBands | null)[]) {
  return values.map((value) =>
    value === null
      ? null
      : {
          upper: value.upper.toString(),
          middle: value.middle.toString(),
          lower: value.lower.toString(),
        },
  );
}

describe("calculateBollingerBands", () => {
  it("既知データと一致する(期間 5・2σ)", () => {
    const closes = convertToDecimals(["1", "2", "3", "4", "5"]);
    const bands = calculateBollingerBands(closes, 5, 2);

    expect(bands.slice(0, 4)).toEqual([null, null, null, null]);
    expect(bands[4]?.middle.toString()).toBe("3");
    expect(bands[4]?.upper.toString()).toBe("5.8284271247");
    expect(bands[4]?.lower.toString()).toBe("0.1715728753");
  });

  it("母集団標準偏差(÷N)を用いる", () => {
    const closes = convertToDecimals(["2", "4"]);
    const bands = calculateBollingerBands(closes, 2, 1);

    expect(bands[1]?.middle.toString()).toBe("3");
    expect(bands[1]?.upper.toString()).toBe("4");
    expect(bands[1]?.lower.toString()).toBe("2");
  });

  it("価格が一定のとき上下バンドは中心線と一致する", () => {
    const closes = convertToDecimals(["5", "5", "5"]);
    const bands = calculateBollingerBands(closes, 3, 2);

    expect(bands[2]?.upper.toString()).toBe("5");
    expect(bands[2]?.middle.toString()).toBe("5");
    expect(bands[2]?.lower.toString()).toBe("5");
  });

  it("中心線は SMA と一致する", () => {
    const closes = convertToDecimals(["1.5", "2.25", "3.75", "4.5", "6"]);
    const period = 3;
    const bands = calculateBollingerBands(closes, period, 2);
    const smaValues = calculateSma(closes, period);

    for (const [index, band] of bands.entries()) {
      expect(band?.middle.toString() ?? null).toBe(
        smaValues[index]?.toString() ?? null,
      );
    }
  });

  it("期間に満たない初期区間は null とする", () => {
    const closes = convertToDecimals(["1", "2"]);
    expect(calculateBollingerBands(closes, 3, 2)).toEqual([null, null]);
  });

  it("空の系列には空の結果を返す", () => {
    expect(calculateBollingerBands([], 20, 2)).toEqual([]);
  });

  it("期間が 1 未満または整数でない場合は例外とする", () => {
    const closes = convertToDecimals(["1"]);
    expect(() => calculateBollingerBands(closes, 0, 2)).toThrow();
    expect(() => calculateBollingerBands(closes, 1.5, 2)).toThrow();
  });

  it("倍率が正の数でない場合は例外とする", () => {
    const closes = convertToDecimals(["1"]);
    expect(() => calculateBollingerBands(closes, 1, 0)).toThrow();
    expect(() => calculateBollingerBands(closes, 1, -2)).toThrow();
  });

  it("全期間の計算と窓の不足分を遡った増分計算が任意の分割点で一致する", () => {
    const period = 20;
    const closes = buildFixtureCloses(60);
    const wholeSeries = calculateBollingerBands(closes, period, 2);
    for (let split = 40; split <= 50; split += 1) {
      const lookbackStart = split - (period - 1);
      const incremental = calculateBollingerBands(
        closes.slice(lookbackStart),
        period,
        2,
      );
      expect(
        convertToStrings(incremental.slice(split - lookbackStart)),
      ).toEqual(convertToStrings(wholeSeries.slice(split)));
    }
  });
});
