import { createHash, timingSafeEqual } from "node:crypto";
import type { MiddlewareHandler } from "hono";

function hashApiKey(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

export function createApiKeyAuth(apiKey: string): MiddlewareHandler {
  const expectedHash = hashApiKey(apiKey);
  return async (c, next) => {
    const providedKey = c.req.header("x-api-key");
    if (
      providedKey === undefined ||
      !timingSafeEqual(hashApiKey(providedKey), expectedHash)
    ) {
      return c.json(
        { message: "認証に失敗しました。API キーを確認してください。" },
        401,
      );
    }
    await next();
  };
}
