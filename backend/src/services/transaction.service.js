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
//
// 先查哪些 id 已经存在，**新的插入、已有的更新**——不能只插不改。
// 原来已存在的一律算进 skipped 原样跳过，那意味着"一笔账只要备份过一次，之后所有的修改
// 都停在云端的旧版本"，而手机端收到 2xx 会把它标成已同步，界面上看不出任何异样。
// 改一笔已备份的账、或者把报销标记撤回（reimbursedAt 写回 null），都是这么丢的。
//
// 手机本地那一行是唯一的真相（CLAUDE.md 原则#1），所以更新是**整行覆盖**，
// 不做字段级合并——推上来的就是那一行现在的完整样子。
//
// 查 existing 时带上 userId：内置分类那种全用户共享的 id 不会出现在这里（交易 id 是随机 UUID），
// 但少了这个条件，"存在"问的就是"全表有没有人用过这个 id"，答错的后果是这个用户的账永远插不进来。
export async function batchCreate(userId, items) {
  await verifyRefs(userId, items);

  const ids = items.map((item) => item.id);
  const existing = await prisma.transaction.findMany({
    where: { id: { in: ids }, userId },
    select: { id: true },
  });
  const existingIds = new Set(existing.map((t) => t.id));
  const newItems = items.filter((item) => !existingIds.has(item.id));
  const editedItems = items.filter((item) => existingIds.has(item.id));

  if (newItems.length > 0) {
    await prisma.transaction.createMany({
      data: newItems.map(({ images, ...rest }) => ({ ...rest, userId })),
      skipDuplicates: true,
    });

    // 图片只给新插入的那批建：老的那批已经有自己的图片行了，再插一遍就是重复。
    // 「编辑时换了图片」还没有入口（图床要等 Cloudinary 直传），到时候这里要补一段对账
    const imageRows = newItems.flatMap((item) =>
      (item.images || []).map((image) => ({ transactionId: item.id, url: image.url })),
    );
    if (imageRows.length > 0) {
      await prisma.transactionImage.createMany({ data: imageRows });
    }
  }

  // 一条一条更新：Prisma 没有"按不同数据批量更新多行"的写法，
  // 而这一批里真正被改过的通常只有一两条——绝大多数推送是纯新增，这个循环根本不会转
  for (const { id, images, ...rest } of editedItems) {
    await prisma.transaction.update({ where: { id }, data: rest });
  }

  return { inserted: newItems.length, updated: editedItems.length, skipped: 0 };
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
