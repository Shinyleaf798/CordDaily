import * as Crypto from 'expo-crypto';

import { builtinIconRef } from '@/constants/category-icons';

import { getDb } from './client';

export type CategoryType = 'INCOME' | 'EXPENSE';

export type Category = {
  id: string;
  name: string;
  icon: string | null;
  type: CategoryType;
  parentId: string | null;
  synced: number;
};

export async function listCategories(): Promise<Category[]> {
  const db = await getDb();
  return db.getAllAsync<Category>('SELECT * FROM categories ORDER BY rowid ASC');
}

export async function listCategoriesByType(type: CategoryType): Promise<Category[]> {
  const db = await getDb();
  return db.getAllAsync<Category>('SELECT * FROM categories WHERE type = ? ORDER BY rowid ASC', [type]);
}

const DEFAULT_CATEGORIES: { name: string; icon: string; type: CategoryType }[] = [
  { name: '餐饮', icon: builtinIconRef('food'), type: 'EXPENSE' },
  { name: '购物', icon: builtinIconRef('shopping'), type: 'EXPENSE' },
  { name: '交通', icon: builtinIconRef('transport'), type: 'EXPENSE' },
  { name: '日常', icon: builtinIconRef('daily'), type: 'EXPENSE' },
  { name: '娱乐', icon: builtinIconRef('entertainment'), type: 'EXPENSE' },
  { name: '医疗', icon: builtinIconRef('medical'), type: 'EXPENSE' },
  { name: '学习', icon: builtinIconRef('study'), type: 'EXPENSE' },
  { name: '社交', icon: builtinIconRef('social'), type: 'EXPENSE' },
  { name: '其他', icon: builtinIconRef('other'), type: 'EXPENSE' },
  { name: '工资', icon: builtinIconRef('salary'), type: 'INCOME' },
  { name: '奖金', icon: builtinIconRef('bonus'), type: 'INCOME' },
  { name: '兼职', icon: builtinIconRef('parttime'), type: 'INCOME' },
  { name: '其他收入', icon: builtinIconRef('refund'), type: 'INCOME' },
];

// 默认分类的 icon 存的是 `builtin:food` 这种引用，不是 emoji：
// 图片以后放进 assets/categories/ 并在 constants/category-icons.ts 登记，老数据不用改一行就能开始显示新图。
// 图还没放的阶段由 parseCategoryIcon 落回每个 key 的兜底 emoji，观感跟原来一样。
//
// 首次启动灌入默认分类。id 必须是真 UUID：后端 transaction 的 zod 校验要求 categoryId 是 uuid 格式，
// 用 'cat-food' 这种可读字符串当 id 的话，同步时整批交易会被后端打回。
// 不写成 SQL migration 是因为迁移语句里生成不了 UUID，只能在代码里 Crypto.randomUUID()。
export async function seedDefaultCategories(): Promise<void> {
  const db = await getDb();
  const existing = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM categories');
  if ((existing?.count ?? 0) > 0) return;

  for (const category of DEFAULT_CATEGORIES) {
    await db.runAsync(`INSERT INTO categories (id, name, icon, type, parentId, synced) VALUES (?, ?, ?, ?, NULL, 0)`, [
      Crypto.randomUUID(),
      category.name,
      category.icon,
      category.type,
    ]);
  }
}

export async function createCategory(input: {
  name: string;
  type: CategoryType;
  icon?: string | null;
  parentId?: string | null;
}): Promise<Category> {
  const db = await getDb();
  const category: Category = {
    id: Crypto.randomUUID(),
    name: input.name,
    type: input.type,
    icon: input.icon ?? null,
    parentId: input.parentId ?? null,
    synced: 0,
  };

  await db.runAsync(
    `INSERT INTO categories (id, name, icon, type, parentId, synced) VALUES (?, ?, ?, ?, ?, ?)`,
    [category.id, category.name, category.icon, category.type, category.parentId, category.synced],
  );

  return category;
}

export async function updateCategory(input: { id: string; name: string; icon: string | null }): Promise<void> {
  const db = await getDb();
  // 改完置 synced = 0：这条记录跟服务器上那份已经不一样了，下次同步要重新推
  await db.runAsync('UPDATE categories SET name = ?, icon = ?, synced = 0 WHERE id = ?', [
    input.name,
    input.icon,
    input.id,
  ]);
}

/**
 * 这个分类被多少条记录引用着（交易 + 周期规则）。
 *
 * 删分类前必须问一次：后端 Prisma 那边 `Category → Transaction` 是默认的 Restrict
 * （见 docs/PROJECT-PLAN.md 的删除策略），本地要是允许删、同步时就会被服务器打回，
 * 到时候用户看到的是"删掉的分类又回来了"这种没法解释的现象。所以本地用同一条规则挡住。
 */
export async function countCategoryUsage(id: string): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT
       (SELECT COUNT(*) FROM transactions WHERE categoryId = ?)
       + (SELECT COUNT(*) FROM recurring_transactions WHERE categoryId = ?) AS count`,
    [id, id],
  );
  return row?.count ?? 0;
}

/** 真删行，不做软删除：分类没有历史价值，留着一条 deletedAt 只会让每个查询都要记得过滤它 */
export async function deleteCategory(id: string): Promise<void> {
  const db = await getDb();
  const used = await countCategoryUsage(id);
  if (used > 0) {
    throw new Error(`还有 ${used} 笔记录在用这个分类`);
  }
  await db.runAsync('DELETE FROM categories WHERE id = ?', [id]);
}
