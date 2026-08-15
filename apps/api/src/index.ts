import { createPrismaClient } from "db";
import { createApp } from "./app.ts";

const connectionString = process.env.DATABASE_URL;
if (connectionString === undefined) {
  throw new Error("DATABASE_URL が設定されていません");
}

const app = createApp({
  db: createPrismaClient(connectionString),
  now: Date.now,
});

export default app;
