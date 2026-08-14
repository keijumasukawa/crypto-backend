import { describe, expect, it } from "vitest";
import { validateKlineInterval } from "../src/series.ts";

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
