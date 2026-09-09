import prisma from "../config/prisma.js";
import { ApiError } from "../utils/response.js";

export async function list(userId) {
  return prisma.account.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
}

export async function create(userId, data) {
  return prisma.account.create({ data: { ...data, userId } });
}

export async function update(userId, id, data) {
  await assertOwned(userId, id);
  return prisma.account.update({ where: { id }, data });
}

export async function remove(userId, id) {
  await assertOwned(userId, id);
  await prisma.account.delete({ where: { id } });
}

// 余额是衍生值：openingBalance + 收支净额 + 转入 - 转出，从不在数据库里缓存，见 CLAUDE.md 核心架构原则 #6
export async function getBalance(userId, id) {
  const account = await assertOwned(userId, id);

  const [incomeSum, expenseSum, transfersIn, transfersOut] = await Promise.all([
    prisma.transaction.aggregate({
      where: { accountId: id, userId, type: "INCOME" },
      _sum: { amountInBase: true },
    }),
    prisma.transaction.aggregate({
      where: { accountId: id, userId, type: "EXPENSE" },
      _sum: { amountInBase: true },
    }),
    prisma.transfer.aggregate({
      where: { toAccountId: id, userId },
      _sum: { amount: true },
    }),
    prisma.transfer.aggregate({
      where: { fromAccountId: id, userId },
      _sum: { amount: true },
    }),
  ]);

  const income = incomeSum._sum.amountInBase ?? 0;
  const expense = expenseSum._sum.amountInBase ?? 0;
  const inflow = transfersIn._sum.amount ?? 0;
  const outflow = transfersOut._sum.amount ?? 0;

  const balance =
    Number(account.openingBalance) + Number(income) - Number(expense) + Number(inflow) - Number(outflow);

  return { accountId: id, balance };
}

async function assertOwned(userId, id) {
  const account = await prisma.account.findFirst({ where: { id, userId } });
  if (!account) {
    throw new ApiError(404, "NOT_FOUND", "Account not found");
  }
  return account;
}
