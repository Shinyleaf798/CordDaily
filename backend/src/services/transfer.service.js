import prisma from "../config/prisma.js";
import { ApiError } from "../utils/response.js";

export async function list(userId) {
  return prisma.transfer.findMany({
    where: { userId },
    orderBy: { date: "desc" },
  });
}

// 同 transactions/batch：客户端生成 id，已存在的更新、没有的插入
export async function batchCreate(userId, items) {
  await verifyAccounts(userId, items);

  const ids = items.map((item) => item.id);
  const existing = await prisma.transfer.findMany({
    where: { id: { in: ids }, userId },
    select: { id: true },
  });
  const existingIds = new Set(existing.map((t) => t.id));
  const newItems = items.filter((item) => !existingIds.has(item.id));
  const editedItems = items.filter((item) => existingIds.has(item.id));

  if (newItems.length > 0) {
    await prisma.transfer.createMany({
      data: newItems.map((item) => ({ ...item, userId })),
      skipDuplicates: true,
    });
  }

  for (const { id, ...rest } of editedItems) {
    await prisma.transfer.update({ where: { id }, data: rest });
  }

  return { inserted: newItems.length, updated: editedItems.length, skipped: 0 };
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
