import prisma from "../config/prisma.js";
import { monthRange } from "../utils/date.js";

// 只读聚合，供电脑端图表用；GROUP BY / SUM 在 SQL 层做，不在应用层拉全表再算
export async function summary(userId, month) {
  const { start, end } = monthRange(month);

  const [income, expense] = await Promise.all([
    prisma.transaction.aggregate({
      where: { userId, type: "INCOME", excludeFromStats: false, date: { gte: start, lt: end } },
      _sum: { amountInBase: true },
    }),
    prisma.transaction.aggregate({
      where: { userId, type: "EXPENSE", excludeFromStats: false, date: { gte: start, lt: end } },
      _sum: { amountInBase: true },
    }),
  ]);

  const incomeTotal = Number(income._sum.amountInBase ?? 0);
  const expenseTotal = Number(expense._sum.amountInBase ?? 0);

  return { month, income: incomeTotal, expense: expenseTotal, net: incomeTotal - expenseTotal };
}

export async function byCategory(userId, month, type) {
  const { start, end } = monthRange(month);

  const grouped = await prisma.transaction.groupBy({
    by: ["categoryId"],
    where: { userId, type, excludeFromStats: false, date: { gte: start, lt: end } },
    _sum: { amountInBase: true },
  });

  if (grouped.length === 0) return [];

  const categories = await prisma.category.findMany({
    where: { id: { in: grouped.map((g) => g.categoryId) } },
    select: { id: true, name: true, icon: true },
  });
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  return grouped.map((g) => ({
    categoryId: g.categoryId,
    categoryName: categoryById.get(g.categoryId)?.name ?? null,
    icon: categoryById.get(g.categoryId)?.icon ?? null,
    total: Number(g._sum.amountInBase ?? 0),
  }));
}
