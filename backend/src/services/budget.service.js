import prisma from "../config/prisma.js";
import { ApiError } from "../utils/response.js";
import { monthRange } from "../utils/date.js";

export async function list(userId) {
  return prisma.budget.findMany({
    where: { userId },
    include: { category: true },
  });
}

// 接口清单里 budgets 只有 GET/POST（见 docs/PROJECT-PLAN.md 第4节），没有单独的 PUT，
// 所以"设置某分类的预算"统一用 upsert：已存在就改金额，不存在就新建，前端不用关心 budget 的 id
export async function upsert(userId, { categoryId, amount }) {
  const category = await prisma.category.findFirst({ where: { id: categoryId, userId } });
  if (!category) {
    throw new ApiError(400, "INVALID_CATEGORY", "Category does not belong to this user");
  }

  return prisma.budget.upsert({
    where: { userId_categoryId: { userId, categoryId } },
    create: { userId, categoryId, amount },
    update: { amount },
  });
}

// 各分类预算 vs 实际花费，供电脑端只读展示；手机端的超支提醒是本地实时算的，不依赖这个接口
export async function status(userId, month) {
  const { start, end } = monthRange(month);

  const budgets = await prisma.budget.findMany({
    where: { userId },
    include: { category: true },
  });

  const spend = await prisma.transaction.groupBy({
    by: ["categoryId"],
    where: {
      userId,
      type: "EXPENSE",
      excludeFromStats: false,
      date: { gte: start, lt: end },
    },
    _sum: { amountInBase: true },
  });
  const spendByCategory = new Map(spend.map((s) => [s.categoryId, Number(s._sum.amountInBase ?? 0)]));

  return budgets.map((budget) => ({
    categoryId: budget.categoryId,
    categoryName: budget.category.name,
    budgetAmount: Number(budget.amount),
    actualSpend: spendByCategory.get(budget.categoryId) ?? 0,
  }));
}
