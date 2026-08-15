import { KLINE_INTERVALS } from "core";
import { getLatestKlineCloseTime } from "db";
import { Hono } from "hono";
import { createApiKeyAuth } from "./auth.ts";
import type { ApiDependencies } from "./types.ts";

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

  return app;
}
