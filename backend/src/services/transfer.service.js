import prisma from "../config/prisma.js";
import { ApiError } from "../utils/response.js";

export async function list(userId) {
  return prisma.transfer.findMany({
    where: { userId },
    orderBy: { date: "desc" },
  });
}

// 同 transactions/batch：客户端生成 id，插入前先查哪些已存在，做幂等去重
export async function batchCreate(userId, items) {
  await verifyAccounts(userId, items);

  const ids = items.map((item) => item.id);
  const existing = await prisma.transfer.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  const existingIds = new Set(existing.map((t) => t.id));
  const newItems = items.filter((item) => !existingIds.has(item.id));

  if (newItems.length === 0) {
    return { inserted: 0, skipped: items.length };
  }

  await prisma.transfer.createMany({
    data: newItems.map((item) => ({ ...item, userId })),
    skipDuplicates: true,
  });

  return { inserted: newItems.length, skipped: items.length - newItems.length };
}

async function verifyAccounts(userId, items) {
  for (const item of items) {
    if (item.fromAccountId === item.toAccountId) {
      throw new ApiError(400, "INVALID_TRANSFER", "fromAccountId and toAccountId must be different");
    }
  }

  const accountIds = [...new Set(items.flatMap((i) => [i.fromAccountId, i.toAccountId]))];
  const accounts = await prisma.account.findMany({
    where: { id: { in: accountIds }, userId },
    select: { id: true },
  });
  if (accounts.length !== accountIds.length) {
    throw new ApiError(400, "INVALID_ACCOUNT", "One or more accounts do not belong to this user");
  }
}
