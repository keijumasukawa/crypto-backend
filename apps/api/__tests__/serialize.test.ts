import type { IndicatorValueRow, KlineRow, SignalRow } from "db";
import { describe, expect, it } from "vitest";
import {
  convertToIndicatorValueResponse,
  convertToKlineResponse,
  convertToSignalResponse,
  convertToSymbolResponse,
  formatDecimal,
} from "../src/serialize.ts";

function buildKlineRow(): KlineRow {
  return {
    symbol: "BTCUSDT",
    interval: "1d",
    openTime: 1786320000000n,
    open: "63466.01",
    high: "64010",
    low: "63350.5",
    close: "63480",
    volume: "6874.65959",
    closeTime: 1786406399999n,
    quoteAssetVolume: "436235144.2",
    numberOfTrades: 1990499,
    takerBuyBaseAssetVolume: "3400.5",
    takerBuyQuoteAssetVolume: "215800000",
  };
}

function buildIndicatorValueRow(): IndicatorValueRow {
  return {
    symbol: "BTCUSDT",
    interval: "1d",
    openTime: 1786320000000n,
    sma20: "63000.5",
    sma50: null,
    sma200: null,
    ema12: "63100.25",
    ema26: null,
    rsi14: "56.4",
    macd: null,
    macdSignal: null,
    macdHist: null,
    bbUpper: "65000",
    bbMiddle: "63000.5",
    bbLower: "61001",
    rsiAvgGain14: "120.5",
    rsiAvgLoss14: "95.25",
  };
}

function buildSignalRow(): SignalRow {
  return {
    symbol: "BTCUSDT",
    interval: "1d",
    openTime: 1786320000000n,
    logicVersion: "rule-v1",
    direction: "bullish",
    score: "0.4",
    components: { v: [1, 0, 1, 0, 0], e: 31 },
    generatedAt: new Date("2026-08-15T00:05:00.000Z"),
  };
}

describe("formatDecimal", () => {
  it("小数 10 桁に固定して末尾ゼロを補完する", () => {
    expect(formatDecimal("0.5")).toBe("0.5000000000");
    expect(formatDecimal("63466.01")).toBe("63466.0100000000");
    expect(formatDecimal("100")).toBe("100.0000000000");
  });
});

describe("convertToKlineResponse", () => {
  it("時刻を number に変換し全フィールドを対応させる", () => {
    const response = convertToKlineResponse(buildKlineRow());

    expect(response.openTime).toBe(1786320000000);
    expect(response.closeTime).toBe(1786406399999);
    expect(typeof response.openTime).toBe("number");
    expect(response.open).toBe("63466.0100000000");
    expect(response.numberOfTrades).toBe(1990499);
    expect(response.symbol).toBe("BTCUSDT");
  });
});

describe("convertToIndicatorValueResponse", () => {
  it("NULL を保持し、状態カラムを応答に含めない", () => {
    const response = convertToIndicatorValueResponse(buildIndicatorValueRow());

    expect(response.sma50).toBeNull();
    expect(response.macd).toBeNull();
    expect(response).not.toHaveProperty("rsiAvgGain14");
    expect(response).not.toHaveProperty("rsiAvgLoss14");
  });

  it("指標値を小数 10 桁に固定する", () => {
    const response = convertToIndicatorValueResponse(buildIndicatorValueRow());

    expect(response.sma20).toBe("63000.5000000000");
    expect(response.rsi14).toBe("56.4000000000");
    expect(response.bbUpper).toBe("65000.0000000000");
  });
});

describe("convertToSymbolResponse", () => {
  it("onboardDate を ISO 8601 の UTC 文字列に変換する", () => {
    const response = convertToSymbolResponse({
      symbol: "BNBUSDT",
      baseAsset: "BNB",
      quoteAsset: "USDT",
      onboardDate: new Date("2017-11-06T00:00:00.000Z"),
      isActive: true,
    });

    expect(response.onboardDate).toBe("2017-11-06T00:00:00.000Z");
    expect(response.isActive).toBe(true);
  });
});

describe("convertToSignalResponse", () => {
  it("score を 10 桁固定・generatedAt を ISO 文字列に変換する", () => {
    const response = convertToSignalResponse(buildSignalRow());

    expect(response.score).toBe("0.4000000000");
    expect(response.generatedAt).toBe("2026-08-15T00:05:00.000Z");
    expect(response.openTime).toBe(1786320000000);
  });

  it("components を無変換で通す", () => {
    const response = convertToSignalResponse(buildSignalRow());

    expect(response.components).toEqual({ v: [1, 0, 1, 0, 0], e: 31 });
  });
});
