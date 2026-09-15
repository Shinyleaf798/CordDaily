import * as Crypto from 'expo-crypto';

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
  { name: '餐饮', icon: '🍜', type: 'EXPENSE' },
  { name: '购物', icon: '🛍️', type: 'EXPENSE' },
  { name: '交通', icon: '🚌', type: 'EXPENSE' },
  { name: '日常', icon: '🏠', type: 'EXPENSE' },
  { name: '娱乐', icon: '🎮', type: 'EXPENSE' },
  { name: '医疗', icon: '💊', type: 'EXPENSE' },
  { name: '学习', icon: '📚', type: 'EXPENSE' },
  { name: '社交', icon: '🤝', type: 'EXPENSE' },
  { name: '其他', icon: '📦', type: 'EXPENSE' },
  { name: '工资', icon: '💰', type: 'INCOME' },
  { name: '奖金', icon: '🧧', type: 'INCOME' },
  { name: '兼职', icon: '💼', type: 'INCOME' },
  { name: '其他收入', icon: '💵', type: 'INCOME' },
];

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
