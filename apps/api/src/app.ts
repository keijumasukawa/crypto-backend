import { KLINE_INTERVALS } from "core";
import {
  getLatestKlineCloseTime,
  listIndicatorValues,
  listKlines,
  listLatestSignals,
  listSignals,
  listSymbols,
} from "db";
import { Hono } from "hono";
import { createApiKeyAuth } from "./auth.js";
import {
  parseLatestSignalQuery,
  parseSeriesQuery,
  parseSignalQuery,
} from "./query.js";
import {
  convertToIndicatorValueResponse,
  convertToKlineResponse,
  convertToSignalResponse,
  convertToSymbolResponse,
} from "./serialize.js";
import type { ApiDependencies } from "./types.js";

const STALE_THRESHOLD_MILLISECONDS = 2 * 60 * 60 * 1000;

export function createApp(dependencies: ApiDependencies): Hono {
  const { db, now, apiKey } = dependencies;
  const app = new Hono();

  app.get("/api/health", async (c) => {
    const serverTime = now();
    const latestDataAt: Record<string, number | null> = {};
    for (const interval of KLINE_INTERVALS) {
      const closeTime = await getLatestKlineCloseTime(db, interval);
      latestDataAt[interval] = closeTime === null ? null : Number(closeTime);
    }
    const latestHourly = latestDataAt["1h"];
    const status =
      latestHourly !== null &&
      latestHourly !== undefined &&
      serverTime - latestHourly < STALE_THRESHOLD_MILLISECONDS
        ? "ok"
        : "stale";
    return c.json({ status, latestDataAt, serverTime });
  });

  app.use("/api/*", createApiKeyAuth(apiKey));

  app.get("/api/symbols", async (c) => {
    const symbols = await listSymbols(db);
    return c.json(symbols.map(convertToSymbolResponse));
  });

  app.get("/api/klines", async (c) => {
    const result = parseSeriesQuery(c.req.query());
    if (!result.isValid) {
      return c.json({ message: result.message }, 400);
    }
    const { symbol, interval, startTime, endTime, limit } = result.query;
    const klines = await listKlines(
      db,
      symbol,
      interval,
      startTime,
      endTime,
      limit,
    );
    return c.json(klines.map(convertToKlineResponse));
  });

  app.get("/api/indicator-values", async (c) => {
    const result = parseSeriesQuery(c.req.query());
    if (!result.isValid) {
      return c.json({ message: result.message }, 400);
    }
    const { symbol, interval, startTime, endTime, limit } = result.query;
    const indicatorValues = await listIndicatorValues(
      db,
      symbol,
      interval,
      startTime,
      endTime,
      limit,
    );
    return c.json(indicatorValues.map(convertToIndicatorValueResponse));
  });

  app.get("/api/signals", async (c) => {
    const result = parseSignalQuery(c.req.query());
    if (!result.isValid) {
      return c.json({ message: result.message }, 400);
    }
    const { symbol, interval, logicVersion, limit } = result.query;
    const signals = await listSignals(
      db,
      symbol,
      interval,
      logicVersion,
      limit,
    );
    return c.json(signals.map(convertToSignalResponse));
  });

  app.get("/api/signals/latest", async (c) => {
    const result = parseLatestSignalQuery(c.req.query());
    if (!result.isValid) {
      return c.json({ message: result.message }, 400);
    }
    const { interval, logicVersion } = result.query;
    const signals = await listLatestSignals(db, interval, logicVersion);
    return c.json(signals.map(convertToSignalResponse));
  });

  return app;
}
