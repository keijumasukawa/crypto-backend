import { getLatestKlineCloseTime, type PrismaClient } from "db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.ts";

vi.mock("db", () => ({
  getLatestKlineCloseTime: vi.fn(),
}));

const NOW = 1_786_500_000_000;
const HOUR_MILLISECONDS = 60 * 60 * 1000;
const dbStub = {} as unknown as PrismaClient;

type HealthResponse = {
  status: string;
  latestDataAt: Record<string, number | null>;
  serverTime: number;
};

const API_KEY = "test-key";

function buildApp() {
  return createApp({ db: dbStub, now: () => NOW, apiKey: API_KEY });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/health", () => {
  it("全インターバルのデータが新しい場合は ok を返す", async () => {
    vi.mocked(getLatestKlineCloseTime).mockResolvedValue(
      BigInt(NOW - HOUR_MILLISECONDS),
    );

    const response = await buildApp().request("/api/health");

    expect(response.status).toBe(200);
    const body = (await response.json()) as HealthResponse;
    expect(body.status).toBe("ok");
    expect(body.latestDataAt).toEqual({
      "1h": NOW - HOUR_MILLISECONDS,
      "4h": NOW - HOUR_MILLISECONDS,
      "1d": NOW - HOUR_MILLISECONDS,
    });
    expect(body.serverTime).toBe(NOW);
  });

  it("1h が 2 時間以上遅れている場合は stale を返す", async () => {
    vi.mocked(getLatestKlineCloseTime).mockImplementation(
      async (_db, interval) =>
        interval === "1h"
          ? BigInt(NOW - 2 * HOUR_MILLISECONDS)
          : BigInt(NOW - HOUR_MILLISECONDS),
    );

    const response = await buildApp().request("/api/health");

    const body = (await response.json()) as HealthResponse;
    expect(body.status).toBe("stale");
  });

  it("データが無い場合は stale と null を返す", async () => {
    vi.mocked(getLatestKlineCloseTime).mockResolvedValue(null);

    const response = await buildApp().request("/api/health");

    const body = (await response.json()) as HealthResponse;
    expect(body.status).toBe("stale");
    expect(body.latestDataAt).toEqual({ "1h": null, "4h": null, "1d": null });
  });
});

describe("ルーティング", () => {
  it("認証済みでも未定義のルートは 404 を返す", async () => {
    const response = await buildApp().request("/api/unknown", {
      headers: { "x-api-key": API_KEY },
    });

    expect(response.status).toBe(404);
  });
});

describe("API キー認証", () => {
  function buildProtectedApp() {
    const app = buildApp();
    app.get("/api/protected", (c) => c.json({ ok: true }));
    return app;
  }

  it("/api/health はキーなしでも通る", async () => {
    vi.mocked(getLatestKlineCloseTime).mockResolvedValue(BigInt(NOW));

    const response = await buildApp().request("/api/health");

    expect(response.status).toBe(200);
  });

  it("保護ルートはキーなしで 401 になる", async () => {
    const response = await buildProtectedApp().request("/api/protected");

    expect(response.status).toBe(401);
  });

  it("誤ったキーは長さが違っても 401 になる", async () => {
    const shortKey = await buildProtectedApp().request("/api/protected", {
      headers: { "x-api-key": "wrong" },
    });
    const longKey = await buildProtectedApp().request("/api/protected", {
      headers: { "x-api-key": "test-key-with-extra-length" },
    });

    expect(shortKey.status).toBe(401);
    expect(longKey.status).toBe(401);
  });

  it("正しいキーで通過する", async () => {
    const response = await buildProtectedApp().request("/api/protected", {
      headers: { "x-api-key": API_KEY },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });
});
