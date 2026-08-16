import { describe, expect, it } from "vitest";
import {
  parseLatestSignalQuery,
  parseSeriesQuery,
  parseSignalQuery,
} from "../src/query.js";

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

describe("parseSignalQuery", () => {
  it("必須のみの指定で既定値を適用する", () => {
    const result = parseSignalQuery({ symbol: "BTCUSDT", interval: "1h" });

    expect(result).toEqual({
      isValid: true,
      query: {
        symbol: "BTCUSDT",
        interval: "1h",
        logicVersion: "rule-v1",
        startTime: null,
        endTime: null,
        limit: 100,
      },
    });
  });

  it("全パラメータを解析する", () => {
    const result = parseSignalQuery({
      symbol: "BTCUSDT",
      interval: "1d",
      logicVersion: "rule-v2",
      startTime: "1600000000000",
      endTime: "1700000000000",
      limit: "500",
    });

    expect(result).toEqual({
      isValid: true,
      query: {
        symbol: "BTCUSDT",
        interval: "1d",
        logicVersion: "rule-v2",
        startTime: 1600000000000n,
        endTime: 1700000000000n,
        limit: 500,
      },
    });
  });

  it("startTime が整数でない場合は無効とする", () => {
    expect(
      parseSignalQuery({
        symbol: "BTCUSDT",
        interval: "1h",
        startTime: "abc",
      }),
    ).toMatchObject({ isValid: false });
  });

  it("symbol がない場合は無効とする", () => {
    expect(parseSignalQuery({ interval: "1h" })).toMatchObject({
      isValid: false,
    });
  });

  it("interval が不正な場合は無効とする", () => {
    expect(
      parseSignalQuery({ symbol: "BTCUSDT", interval: "5m" }),
    ).toMatchObject({ isValid: false });
  });

  it("limit が範囲外の場合は無効とする", () => {
    expect(
      parseSignalQuery({ symbol: "BTCUSDT", interval: "1h", limit: "1001" }),
    ).toMatchObject({ isValid: false });
  });
});

describe("parseLatestSignalQuery", () => {
  it("interval のみの指定で既定値を適用する", () => {
    const result = parseLatestSignalQuery({ interval: "1d" });

    expect(result).toEqual({
      isValid: true,
      query: { interval: "1d", logicVersion: "rule-v1" },
    });
  });

  it("logicVersion を指定できる", () => {
    const result = parseLatestSignalQuery({
      interval: "1h",
      logicVersion: "rule-v2",
    });

    expect(result).toEqual({
      isValid: true,
      query: { interval: "1h", logicVersion: "rule-v2" },
    });
  });

  it("interval が不正な場合は無効とする", () => {
    expect(parseLatestSignalQuery({ interval: "5m" })).toMatchObject({
      isValid: false,
    });
    expect(parseLatestSignalQuery({})).toMatchObject({ isValid: false });
  });
});
