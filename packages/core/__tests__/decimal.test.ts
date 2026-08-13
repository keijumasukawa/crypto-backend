import { describe, expect, it } from "vitest";
import { Decimal, roundDecimal } from "../src/decimal.ts";

describe("roundDecimal", () => {
  it("小数 10 桁を超える値を 10 桁に丸める", () => {
    expect(roundDecimal(new Decimal("0.12345678901")).toString()).toBe(
      "0.123456789",
    );
  });

  it("11 桁目が 5 のとき切り上げる(ROUND_HALF_UP)", () => {
    expect(roundDecimal(new Decimal("0.00000000005")).toString()).toBe("1e-10");
    expect(roundDecimal(new Decimal("1.00000000015")).toString()).toBe(
      "1.0000000002",
    );
  });

  it("負数は 0 から遠い方向へ丸める(ROUND_HALF_UP)", () => {
    expect(roundDecimal(new Decimal("-0.00000000005")).toString()).toBe(
      "-1e-10",
    );
    expect(roundDecimal(new Decimal("-1.00000000015")).toString()).toBe(
      "-1.0000000002",
    );
  });

  it("11 桁目が 4 のとき切り捨てる", () => {
    expect(roundDecimal(new Decimal("1.00000000014")).toString()).toBe(
      "1.0000000001",
    );
  });

  it("小数 10 桁以内の値は変化しない", () => {
    expect(roundDecimal(new Decimal("123.4567890123")).toString()).toBe(
      "123.4567890123",
    );
  });

  it("整数部 20 桁 + 小数部 10 桁の値を欠損なく丸める", () => {
    expect(
      roundDecimal(new Decimal("12345678901234567890.01234567891")).toFixed(10),
    ).toBe("12345678901234567890.0123456789");
  });

  it("割り切れない除算の結果を 10 桁に丸める", () => {
    expect(roundDecimal(new Decimal(1).div(3)).toString()).toBe("0.3333333333");
    expect(roundDecimal(new Decimal(2).div(3)).toString()).toBe("0.6666666667");
  });
});

describe("Decimal", () => {
  it("整数部 20 桁 + 小数部 10 桁の演算で桁を維持する", () => {
    const value = new Decimal("99999999999999999999.9999999999");
    expect(value.plus("0.0000000001").toFixed(10)).toBe(
      "100000000000000000000.0000000000",
    );
  });
});
