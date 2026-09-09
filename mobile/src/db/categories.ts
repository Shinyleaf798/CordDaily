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
  return db.getAllAsync<Category>('SELECT * FROM categories ORDER BY name ASC');
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
