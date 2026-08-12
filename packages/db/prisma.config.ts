import { resolve } from "node:path";
import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";

config({ path: resolve(import.meta.dirname, "../../.env") });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DIRECT_URL"),
  },
});
