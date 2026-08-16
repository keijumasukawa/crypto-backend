import {
  KLINE_INTERVALS,
  RULE_V1_LOGIC_VERSION,
  type KlineInterval,
} from "core";
import type {
  LatestSignalQueryResult,
  SeriesQueryResult,
  SignalQueryResult,
} from "./types.js";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;
const INTEGER_PATTERN = /^\d+$/;

function isKlineInterval(value: string): value is KlineInterval {
  return (KLINE_INTERVALS as readonly string[]).includes(value);
}

function parseEpochMilliseconds(
  value: string | undefined,
): bigint | null | undefined {
  if (value === undefined) {
    return null;
  }
  return INTEGER_PATTERN.test(value) ? BigInt(value) : undefined;
}

function parseLimit(value: string): number | null {
  if (!INTEGER_PATTERN.test(value)) {
    return null;
  }
  const parsed = Number(value);
  return parsed >= 1 && parsed <= MAX_LIMIT ? parsed : null;
}

export function parseSeriesQuery(
  params: Record<string, string>,
): SeriesQueryResult {
  const { symbol, interval, startTime, endTime, limit } = params;
  if (symbol === undefined || symbol === "") {
    return { isValid: false, message: "symbol を指定してください。" };
  }
  if (interval === undefined || !isKlineInterval(interval)) {
    return {
      isValid: false,
      message: "interval には 1h、4h、1d のいずれかを指定してください。",
    };
  }
  const parsedStartTime = parseEpochMilliseconds(startTime);
  if (parsedStartTime === undefined) {
    return {
      isValid: false,
      message: "startTime にはミリ秒単位の時刻を整数で指定してください。",
    };
  }
  const parsedEndTime = parseEpochMilliseconds(endTime);
  if (parsedEndTime === undefined) {
    return {
      isValid: false,
      message: "endTime にはミリ秒単位の時刻を整数で指定してください。",
    };
  }
  const parsedLimit = limit === undefined ? DEFAULT_LIMIT : parseLimit(limit);
  if (parsedLimit === null) {
    return {
      isValid: false,
      message: "limit には 1 から 1000 までの整数を指定してください。",
    };
  }
  return {
    isValid: true,
    query: {
      symbol,
      interval,
      startTime: parsedStartTime,
      endTime: parsedEndTime,
      limit: parsedLimit,
    },
  };
}

export function parseSignalQuery(
  params: Record<string, string>,
): SignalQueryResult {
  const { symbol, interval, logicVersion, startTime, endTime, limit } = params;
  if (symbol === undefined || symbol === "") {
    return { isValid: false, message: "symbol を指定してください。" };
  }
  if (interval === undefined || !isKlineInterval(interval)) {
    return {
      isValid: false,
      message: "interval には 1h、4h、1d のいずれかを指定してください。",
    };
  }
  const parsedStartTime = parseEpochMilliseconds(startTime);
  if (parsedStartTime === undefined) {
    return {
      isValid: false,
      message: "startTime にはミリ秒単位の時刻を整数で指定してください。",
    };
  }
  const parsedEndTime = parseEpochMilliseconds(endTime);
  if (parsedEndTime === undefined) {
    return {
      isValid: false,
      message: "endTime にはミリ秒単位の時刻を整数で指定してください。",
    };
  }
  const parsedLimit = limit === undefined ? DEFAULT_LIMIT : parseLimit(limit);
  if (parsedLimit === null) {
    return {
      isValid: false,
      message: "limit には 1 から 1000 までの整数を指定してください。",
    };
  }
  return {
    isValid: true,
    query: {
      symbol,
      interval,
      logicVersion:
        logicVersion === undefined || logicVersion === ""
          ? RULE_V1_LOGIC_VERSION
          : logicVersion,
      startTime: parsedStartTime,
      endTime: parsedEndTime,
      limit: parsedLimit,
    },
  };
}

export function parseLatestSignalQuery(
  params: Record<string, string>,
): LatestSignalQueryResult {
  const { interval, logicVersion } = params;
  if (interval === undefined || !isKlineInterval(interval)) {
    return {
      isValid: false,
      message: "interval には 1h、4h、1d のいずれかを指定してください。",
    };
  }
  return {
    isValid: true,
    query: {
      interval,
      logicVersion:
        logicVersion === undefined || logicVersion === ""
          ? RULE_V1_LOGIC_VERSION
          : logicVersion,
    },
  };
}
