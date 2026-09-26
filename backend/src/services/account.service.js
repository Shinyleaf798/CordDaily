import prisma from "../config/prisma.js";
import { ApiError } from "../utils/response.js";

export async function list(userId) {
  return prisma.account.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
}

// 手机端建账户时 id 就定了（CLAUDE.md 原则#2），这里按 (userId, id) upsert 而不是 create：
// 同一批数据重推一次不能变成两行，而两个内置账户（「不选择任何账户」「现金」）的 id
// 是所有用户共用的常量，所以主键必须带上 userId 才不会互相撞。
export async function create(userId, { id, ...data }) {
  return prisma.account.upsert({
    where: { userId_id: { userId, id } },
    create: { ...data, id, userId },
    update: data,
  });
}

export async function update(userId, id, data) {
  await assertOwned(userId, id);
  return prisma.account.update({ where: { userId_id: { userId, id } }, data });
}

export async function remove(userId, id) {
  await assertOwned(userId, id);
  await prisma.account.delete({ where: { userId_id: { userId, id } } });
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
