import { describe, expect, it } from "vitest";
import { parseOpenTime, validateKlineInterval } from "../src/series.js";

describe("validateKlineInterval", () => {
  it("対象のインターバルを受理する", () => {
    expect(validateKlineInterval("1h")).toBe("1h");
    expect(validateKlineInterval("4h")).toBe("4h");
    expect(validateKlineInterval("1d")).toBe("1d");
  });

  it("対象外の値と未指定は例外とする", () => {
    expect(() => validateKlineInterval("1m")).toThrow("インターバル");
    expect(() => validateKlineInterval("")).toThrow("インターバル");
    expect(() => validateKlineInterval(undefined)).toThrow("インターバル");
  });
});

describe("parseOpenTime", () => {
  it("数字列をミリ秒のエポック時刻として受理する", () => {
    expect(parseOpenTime("0")).toBe(0n);
    expect(parseOpenTime("1700000000000")).toBe(1700000000000n);
  });

  it("非数値・空・未指定は例外とする", () => {
    expect(() => parseOpenTime("abc")).toThrow("開始時点");
    expect(() => parseOpenTime("")).toThrow("開始時点");
    expect(() => parseOpenTime(undefined)).toThrow("開始時点");
    expect(() => parseOpenTime("-5")).toThrow("開始時点");
  });
});
