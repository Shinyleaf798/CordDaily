import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// CLI 专用配置（migrate/generate/studio）。运行时 PrismaClient 的连接串
// 走 src/config/prisma.js 里的 driver adapter，两边分开配置，见 DECISIONS.md
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
