import { describe, expect, it } from "vitest";
import { parseSeriesQuery } from "../src/query.ts";

describe("parseSeriesQuery", () => {
  it("必須のみの指定で既定値を適用する", () => {
    const result = parseSeriesQuery({ symbol: "BTCUSDT", interval: "1h" });

    expect(result).toEqual({
      isValid: true,
      query: {
        symbol: "BTCUSDT",
        interval: "1h",
        startTime: null,
        endTime: null,
        limit: 100,
      },
    });
  });

  it("全パラメータを解析する", () => {
    const result = parseSeriesQuery({
      symbol: "BTCUSDT",
      interval: "1d",
      startTime: "1600000000000",
      endTime: "1700000000000",
      limit: "1000",
    });

    expect(result).toEqual({
      isValid: true,
      query: {
        symbol: "BTCUSDT",
        interval: "1d",
        startTime: 1600000000000n,
        endTime: 1700000000000n,
        limit: 1000,
      },
    });
  });

  it("symbol がない場合は無効とする", () => {
    const result = parseSeriesQuery({ interval: "1h" });

    expect(result).toMatchObject({ isValid: false });
  });

  it("interval が不正な場合は無効とする", () => {
    const result = parseSeriesQuery({ symbol: "BTCUSDT", interval: "5m" });

    expect(result).toMatchObject({ isValid: false });
  });

  it("startTime が整数でない場合は無効とする", () => {
    const result = parseSeriesQuery({
      symbol: "BTCUSDT",
      interval: "1h",
      startTime: "abc",
    });

    expect(result).toMatchObject({ isValid: false });
  });

  it("limit が範囲外の場合は無効とする", () => {
    expect(
      parseSeriesQuery({ symbol: "BTCUSDT", interval: "1h", limit: "0" }),
    ).toMatchObject({ isValid: false });
    expect(
      parseSeriesQuery({ symbol: "BTCUSDT", interval: "1h", limit: "1001" }),
    ).toMatchObject({ isValid: false });
  });
});
