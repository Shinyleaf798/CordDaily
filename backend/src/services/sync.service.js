import prisma from "../config/prisma.js";

/**
 * 恢复用的整包数据。
 *
 * **它返回的不是一个 REST 资源，是一份"备份文件"。** 结构跟手机端导出的 .json
 * 一模一样（见 mobile/src/db/backup.ts 的 BackupBundle），连字段的表示法都照着本地
 * SQLite 的口径来：布尔写成 0/1、标签写成 JSON 字符串、时间写成 ISO 字符串、金额写成数字。
 *
 * 这么做是为了让手机端的恢复**只有一套代码**：`planImport(bundle)` 不关心这份 bundle
 * 是从文件读的还是这个接口拉的（CLAUDE.md 原则#3）。如果这里按 REST 的习惯返回
 * Date 对象和 string[]，手机端就得为服务器这条路再写一个转换层，两条路迟早会分叉。
 *
 * 不带 `schemaVersion`：那个字段记的是导出时**本地 SQLite** 的 user_version，服务器无从得知。
 * 手机端读不到时按 0 处理，于是"备份比本地库还新"那道拦截不会误伤这条路。
 */
export async function getBundle(userId) {
  const [categories, accounts, transactions, transfers, recurring] = await Promise.all([
    prisma.category.findMany({ where: { userId }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.account.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.transaction.findMany({ where: { userId }, include: { images: true } }),
    prisma.transfer.findMany({ where: { userId } }),
    prisma.recurringTransaction.findMany({ where: { userId } }),
  ]);

  return {
    format: "corddaily-backup",
    formatVersion: 1,
    exportedAt: new Date().toISOString(),

    categories: categories.map((category) => ({
      id: category.id,
      name: category.name,
      icon: category.icon,
      type: category.type,
      parentId: category.parentId,
      sortOrder: category.sortOrder,
      isActive: category.isActive ? 1 : 0,
    })),

    accounts: accounts.map((account) => ({
      id: account.id,
      name: account.name,
      type: account.type,
      currency: account.currency,
      openingBalance: Number(account.openingBalance),
      icon: account.icon,
      createdAt: account.createdAt.toISOString(),
    })),

    transactions: transactions.map((transaction) => ({
      id: transaction.id,
      title: transaction.title,
      merchant: transaction.merchant,
      location: transaction.location,
      remarks: transaction.remarks,
      amount: Number(transaction.amount),
      currency: transaction.currency,
      exchangeRate: Number(transaction.exchangeRate),
      amountInBase: Number(transaction.amountInBase),
      type: transaction.type,
      date: transaction.date.toISOString(),
      // 本地那一列是 TEXT，存的就是一段 JSON；这里不能直接给数组
      tags: JSON.stringify(transaction.tags ?? []),
      isReimbursable: transaction.isReimbursable ? 1 : 0,
      reimbursedAt: transaction.reimbursedAt ? transaction.reimbursedAt.toISOString() : null,
      excludeFromStats: transaction.excludeFromStats ? 1 : 0,
      categoryId: transaction.categoryId,
      accountId: transaction.accountId,
      recurringId: transaction.recurringId,
      createdAt: transaction.createdAt.toISOString(),
      updatedAt: transaction.updatedAt.toISOString(),
    })),

    transactionImages: transactions.flatMap((transaction) =>
      transaction.images.map((image) => ({
        id: image.id,
        transactionId: image.transactionId,
        url: image.url,
        createdAt: image.createdAt.toISOString(),
      })),
    ),

    transfers: transfers.map((transfer) => ({
      id: transfer.id,
      amount: Number(transfer.amount),
      date: transfer.date.toISOString(),
      note: transfer.note,
      fromAccountId: transfer.fromAccountId,
      toAccountId: transfer.toAccountId,
      createdAt: transfer.createdAt.toISOString(),
    })),

    recurring: recurring.map((rule) => ({
      id: rule.id,
      title: rule.title,
      remarks: rule.remarks,
      amount: Number(rule.amount),
      currency: rule.currency,
      exchangeRate: Number(rule.exchangeRate),
      type: rule.type,
      frequency: rule.frequency,
      startDate: rule.startDate.toISOString(),
      nextRunDate: rule.nextRunDate.toISOString(),
      endDate: rule.endDate ? rule.endDate.toISOString() : null,
      isActive: rule.isActive ? 1 : 0,
      categoryId: rule.categoryId,
      accountId: rule.accountId,
      createdAt: rule.createdAt.toISOString(),
    })),

    // 月预算只存在手机本地的 app_settings 里，服务器没有（见 docs/PROJECT-PLAN.md 第 5 节）。
    // 字段留着并显式给 null，是为了让这份包跟文件备份**结构完全一致**
    settings: { overallMonthlyBudget: null },
  };
}

/** 这个账号在服务器上有没有数据。重装后那句「云端有 1,284 笔账单」问不问得出口，靠它 */
export async function getSummary(userId) {
  const [transactions, categories, accounts, latest] = await Promise.all([
    prisma.transaction.count({ where: { userId } }),
    prisma.category.count({ where: { userId } }),
    prisma.account.count({ where: { userId } }),
    prisma.transaction.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);

  return {
    transactions,
    categories,
    accounts,
    lastUploadAt: latest ? latest.createdAt.toISOString() : null,
  };
}
