import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import env from "./env.js";

// 单例，避免 nodemon 热重载时反复创建连接池
// Prisma 7 起连接串不再放 schema.prisma，运行时通过 driver adapter 传入
const globalForPrisma = globalThis;

const adapter = new PrismaPg({ connectionString: env.databaseUrl });
const prisma = globalForPrisma.prisma || new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
