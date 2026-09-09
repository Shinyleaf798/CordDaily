import prisma from "../config/prisma.js";
import { ApiError } from "../utils/response.js";

export async function list(userId, filters) {
  const where = { userId };
  if (filters.from || filters.to) {
    where.date = {};
    if (filters.from) where.date.gte = filters.from;
    if (filters.to) where.date.lte = filters.to;
  }
  if (filters.categoryId) where.categoryId = filters.categoryId;
  if (filters.accountId) where.accountId = filters.accountId;
  if (filters.type) where.type = filters.type;

  return prisma.transaction.findMany({
    where,
    include: { images: true },
    orderBy: { date: "desc" },
  });
}

// 离线同步入口：本地生成的交易（带客户端 UUID）批量推送上来。
// 幂等去重靠"插入前先查哪些 id 已经存在"，而不是单纯依赖 createMany 的 skipDuplicates 返回值，
// 这样才能准确判断哪些交易是这次新插入的，从而只给新交易插入图片，避免网络重试导致图片重复。
export async function batchCreate(userId, items) {
  await verifyRefs(userId, items);

  const ids = items.map((item) => item.id);
  const existing = await prisma.transaction.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  const existingIds = new Set(existing.map((t) => t.id));
  const newItems = items.filter((item) => !existingIds.has(item.id));

  if (newItems.length === 0) {
    return { inserted: 0, skipped: items.length };
  }

  await prisma.transaction.createMany({
    data: newItems.map(({ images, ...rest }) => ({ ...rest, userId })),
    skipDuplicates: true,
  });

  const imageRows = newItems.flatMap((item) =>
    (item.images || []).map((image) => ({ transactionId: item.id, url: image.url })),
  );
  if (imageRows.length > 0) {
    await prisma.transactionImage.createMany({ data: imageRows });
  }

  return { inserted: newItems.length, skipped: items.length - newItems.length };
}

export async function update(userId, id, data) {
  await assertOwned(userId, id);
  await verifyRefs(userId, [data]);
  return prisma.transaction.update({ where: { id }, data });
}

export async function remove(userId, id) {
  await assertOwned(userId, id);
  await prisma.transaction.delete({ where: { id } });
}

async function assertOwned(userId, id) {
  const transaction = await prisma.transaction.findFirst({ where: { id, userId } });
  if (!transaction) {
    throw new ApiError(404, "NOT_FOUND", "Transaction not found");
  }
  return transaction;
}

// 批量校验 categoryId/accountId/recurringId 都属于这个用户，防止跨用户 id 被塞进请求里
async function verifyRefs(userId, items) {
  const categoryIds = [...new Set(items.map((i) => i.categoryId).filter(Boolean))];
  const accountIds = [...new Set(items.map((i) => i.accountId).filter(Boolean))];
  const recurringIds = [...new Set(items.map((i) => i.recurringId).filter(Boolean))];

  const [categories, accounts, recurring] = await Promise.all([
    categoryIds.length ? prisma.category.findMany({ where: { id: { in: categoryIds }, userId }, select: { id: true } }) : [],
    accountIds.length ? prisma.account.findMany({ where: { id: { in: accountIds }, userId }, select: { id: true } }) : [],
    recurringIds.length
      ? prisma.recurringTransaction.findMany({ where: { id: { in: recurringIds }, userId }, select: { id: true } })
      : [],
  ]);

  if (categories.length !== categoryIds.length) {
    throw new ApiError(400, "INVALID_CATEGORY", "One or more categories do not belong to this user");
  }
  if (accounts.length !== accountIds.length) {
    throw new ApiError(400, "INVALID_ACCOUNT", "One or more accounts do not belong to this user");
  }
  if (recurring.length !== recurringIds.length) {
    throw new ApiError(400, "INVALID_RECURRING", "One or more recurring rules do not belong to this user");
  }
}
