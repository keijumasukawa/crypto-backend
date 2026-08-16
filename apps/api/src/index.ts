import { createPrismaClient } from "db";
import { createApp } from "./app.js";

const connectionString = process.env.DATABASE_URL;
if (connectionString === undefined) {
  throw new Error("環境変数 DATABASE_URL を設定してください。");
}
const apiKey = process.env.API_KEY;
if (apiKey === undefined || apiKey === "") {
  throw new Error("環境変数 API_KEY を設定してください。");
}

const app = createApp({
  db: createPrismaClient(connectionString),
  now: Date.now,
  apiKey,
});

export default app;
