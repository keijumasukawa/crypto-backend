import { getLatestKlineCloseTime, type PrismaClient } from "db";
import { Hono } from "hono";

const STALE_THRESHOLD_MILLISECONDS = 2 * 60 * 60 * 1000;
const HEALTH_INTERVALS = ["1h", "4h", "1d"] as const;

export type ApiDependencies = {
  db: PrismaClient;
  now: () => number;
};

export function createApp(dependencies: ApiDependencies): Hono {
  const { db, now } = dependencies;
  const app = new Hono();

  app.get("/api/health", async (c) => {
    const serverTime = now();
    const latestDataAt: Record<string, number | null> = {};
    for (const interval of HEALTH_INTERVALS) {
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

  return app;
}
