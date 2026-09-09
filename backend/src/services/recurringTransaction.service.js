import prisma from "../config/prisma.js";
import { ApiError } from "../utils/response.js";

export async function list(userId) {
  return prisma.recurringTransaction.findMany({
    where: { userId },
    orderBy: { nextRunDate: "asc" },
  });
}

// id 由手机端本地生成（规则本身也是离线创建的）。重复提交同一个 id 时视为幂等操作，
// 直接返回已存在的规则，而不是报错——同步重试不应该让用户看到失败提示。
export async function create(userId, data) {
  const existing = await prisma.recurringTransaction.findUnique({ where: { id: data.id } });
  if (existing) {
    return existing;
  }

  await verifyRefs(userId, data);
  return prisma.recurringTransaction.create({ data: { ...data, userId } });
}

export async function update(userId, id, data) {
  await assertOwned(userId, id);
  await verifyRefs(userId, data);
  return prisma.recurringTransaction.update({ where: { id }, data });
}

export async function remove(userId, id) {
  await assertOwned(userId, id);
  await prisma.recurringTransaction.delete({ where: { id } });
}

async function assertOwned(userId, id) {
  const rule = await prisma.recurringTransaction.findFirst({ where: { id, userId } });
  if (!rule) {
    throw new ApiError(404, "NOT_FOUND", "Recurring transaction not found");
  }
  return rule;
}

async function verifyRefs(userId, data) {
  if (data.categoryId) {
    const category = await prisma.category.findFirst({ where: { id: data.categoryId, userId } });
    if (!category) {
      throw new ApiError(400, "INVALID_CATEGORY", "Category does not belong to this user");
    }
  }
  if (data.accountId) {
    const account = await prisma.account.findFirst({ where: { id: data.accountId, userId } });
    if (!account) {
      throw new ApiError(400, "INVALID_ACCOUNT", "Account does not belong to this user");
    }
  }
}
