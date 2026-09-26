import * as Crypto from 'expo-crypto';

import { DEFAULT_CATEGORIES } from '@/constants/default-categories';

import { getDb } from './client';

export type CategoryType = 'INCOME' | 'EXPENSE';

export type Category = {
  id: string;
  name: string;
  icon: string | null;
  type: CategoryType;
  parentId: string | null;
  /** 同一层（同收支类型、同一个父）内部的先后。只有一级分类拖得动，见 reorderCategories */
  sortOrder: number;
  /** SQLite 没有布尔，1 = 启用、0 = 停用。停用的分类不出现在记账页，但历史账单照常显示 */
  isActive: number;
  synced: number;
};

/**
 * 排序口径全 App 只有这一句，所有读分类的地方都拼它。
 *
 * rowid 是兜底：sortOrder 撞车时（迁移编号之前建的、或者两台设备各自拖过）
 * 至少还有一个稳定的第二键，否则同值行的顺序每次查询都可能不一样，
 * 列表会"自己动"——用户会以为是拖动没保存。
 */
const ORDER_BY = 'ORDER BY sortOrder ASC, rowid ASC';

export async function listCategories(): Promise<Category[]> {
  const db = await getDb();
  return db.getAllAsync<Category>(`SELECT * FROM categories ${ORDER_BY}`);
}

export async function listCategoriesByType(type: CategoryType): Promise<Category[]> {
  const db = await getDb();
  return db.getAllAsync<Category>(`SELECT * FROM categories WHERE type = ? ${ORDER_BY}`, [type]);
}

// 默认分类的 icon 存的是 `builtin:food` 这种引用，不是 emoji：
// 图片以后放进 assets/categories/ 并在 constants/category-icons.ts 登记，老数据不用改一行就能开始显示新图。
// 图还没放的阶段由 parseCategoryIcon 落回每个 key 的兜底 emoji，观感跟原来一样。
//
// 首次启动灌入默认分类。**id 取自常量表**（`constants/default-categories.ts`），不是现场生成——
// 每台设备上的「餐饮」是同一个 id，重装后恢复备份时那些账单的 categoryId 不用改写就能对上。
// 原来这里是 Crypto.randomUUID()，那正是"重装后账单全变空白行"的根源，见 DECISIONS.md。
//
// sortOrder 按**每种收支类型各自**从 0 开始数，不是数组下标：两种类型是两个独立的列表，
// 用下标的话收入那组会从 9 起跳，虽然顺序仍然对，但之后每次读都得先减掉一个偏移量才好理解。
export async function seedDefaultCategories(): Promise<void> {
  const db = await getDb();
  const existing = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM categories');
  if ((existing?.count ?? 0) > 0) return;

  const nextOrder: Record<CategoryType, number> = { EXPENSE: 0, INCOME: 0 };
  for (const category of DEFAULT_CATEGORIES) {
    await db.runAsync(
      `INSERT INTO categories (id, name, icon, type, parentId, sortOrder, isActive, synced)
       VALUES (?, ?, ?, ?, NULL, ?, 1, 0)`,
      [category.id, category.name, category.icon, category.type, nextOrder[category.type]],
    );
    nextOrder[category.type] += 1;
  }
}

// 默认二级分类跟着一级分类一起挂在 constants/default-categories.ts 的 children 上。
// 图标沿用父的 key——真要给「早餐」单独画个图标，得先往 assets/categories/ 放图，那是另一件事

const SUBCATEGORY_SEED_KEY = 'seededDefaultSubcategories';

/**
 * 灌默认二级分类。跟 seedDefaultCategories 不同，它**不能**用"表空才跑"当条件——
 * 老用户的分类表早就有数据了，那个条件永远为假，二级分类就永远灌不进去。
 * 所以用 app_settings 里的一个标记位，跑过一次就再也不跑：用户把它们删了也不会自己长回来。
 */
export async function seedDefaultSubcategories(): Promise<void> {
  const db = await getDb();
  const seeded = await db.getFirstAsync<{ value: string }>('SELECT "value" FROM app_settings WHERE "key" = ?', [
    SUBCATEGORY_SEED_KEY,
  ]);
  if (seeded) return;

  for (const group of DEFAULT_CATEGORIES) {
    if (!group.children?.length) continue;

    // 按 id 找父，不再按名字：父的 id 现在是常量（见 constants/default-categories.ts），
    // 所以用户把「餐饮」改成「吃饭」之后，子分类照样能挂对地方——按名字找的话会整组跳过
    const parent = await db.getFirstAsync<{ id: string }>('SELECT id FROM categories WHERE id = ?', [group.id]);
    // 用户把那个一级分类删了就跳过，不自作主张建一个回来
    if (!parent) continue;

    let order = 0;
    for (const child of group.children) {
      const exists = await db.getFirstAsync<{ id: string }>(
        'SELECT id FROM categories WHERE id = ? OR (name = ? AND parentId = ?)',
        [child.id, child.name, parent.id],
      );
      // 已经有（同 id 或同名）子分类就跳过，但序号照样往前走——留出它占的那个位置，
      // 免得后面几个挤到已存在的那一条前面去
      order += 1;
      if (exists) continue;
      await db.runAsync(
        `INSERT INTO categories (id, name, icon, type, parentId, sortOrder, isActive, synced)
         VALUES (?, ?, ?, ?, ?, ?, 1, 0)`,
        [child.id, child.name, child.icon, group.type, parent.id, order - 1],
      );
    }
  }

  await db.runAsync('INSERT OR REPLACE INTO app_settings ("key", "value") VALUES (?, ?)', [SUBCATEGORY_SEED_KEY, '1']);
}

const TIP_DISMISSED_KEY = 'categoriesTipDismissed';

/**
 * 管理页顶上那条提示关掉了没有。
 *
 * 存进 app_settings 而不是组件 state：它教的是「长按拖动」和「点 ⋯ 有更多操作」——
 * 两个看不见的操作。关掉它是一句"我知道了"，每次进页面又冒出来就等于没关。
 * 跟预算一样，这是本机偏好，不进服务器。
 */
export async function isCategoryTipDismissed(): Promise<boolean> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>('SELECT "value" FROM app_settings WHERE "key" = ?', [
    TIP_DISMISSED_KEY,
  ]);
  return !!row;
}

export async function dismissCategoryTip(): Promise<void> {
  const db = await getDb();
  await db.runAsync('INSERT OR REPLACE INTO app_settings ("key", "value") VALUES (?, ?)', [TIP_DISMISSED_KEY, '1']);
}

/**
 * 新建的分类排在同一层的最后。
 *
 * `IFNULL(parentId, '')` 两边都套：SQL 里 `NULL = NULL` 不成立，直接 `parentId = ?`
 * 传 null 会一条都匹配不上，于是每个新建的一级分类都拿到 0，全挤在最前面。
 */
async function nextSortOrder(
  db: Awaited<ReturnType<typeof getDb>>,
  type: CategoryType,
  parentId: string | null,
): Promise<number> {
  const row = await db.getFirstAsync<{ next: number }>(
    `SELECT IFNULL(MAX(sortOrder), -1) + 1 AS next FROM categories
     WHERE type = ? AND IFNULL(parentId, '') = IFNULL(?, '')`,
    [type, parentId],
  );
  return row?.next ?? 0;
}

export async function createCategory(input: {
  name: string;
  type: CategoryType;
  icon?: string | null;
  parentId?: string | null;
}): Promise<Category> {
  const db = await getDb();
  const parentId = input.parentId ?? null;
  const category: Category = {
    id: Crypto.randomUUID(),
    name: input.name,
    type: input.type,
    icon: input.icon ?? null,
    parentId,
    sortOrder: await nextSortOrder(db, input.type, parentId),
    isActive: 1,
    synced: 0,
  };

  await db.runAsync(
    `INSERT INTO categories (id, name, icon, type, parentId, sortOrder, isActive, synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      category.id,
      category.name,
      category.icon,
      category.type,
      category.parentId,
      category.sortOrder,
      category.isActive,
      category.synced,
    ],
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
 * 停用 / 启用一个分类。
 *
 * 只写它自己这一行，**不级联到子分类**：一个子分类在记账页只能从父分类点进去，
 * 父停用了它自然就没有入口了——这件事在读的时候算得出来（见 isPickable），
 * 没必要写进库。写进去的话，父分类一停一启就要改一批行，
 * 而且再也分不清某个子分类当初是被连坐的、还是用户自己停的。
 */
export async function setCategoryActive(id: string, isActive: boolean): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE categories SET isActive = ?, synced = 0 WHERE id = ?', [isActive ? 1 : 0, id]);
}

/**
 * 记账页的分类网格该不该显示它：自己启用着，而且（如果有父）父也启用着。
 *
 * 放在 db 层而不是组件里，是因为这条规则同时决定"网格里有什么"和"管理页哪些算已停用"，
 * 两边必须是同一句话。
 */
export function isPickable(category: Category, byId: Map<string, Category>): boolean {
  if (!category.isActive) return false;
  if (!category.parentId) return true;
  const parent = byId.get(category.parentId);
  // 父不在（数据坏了或还没查出来）就当它在：宁可多显示一个，也不要让用户的分类凭空消失
  return parent ? !!parent.isActive : true;
}

/**
 * 把一组分类按给定顺序重新编号。调用方传的是**拖完之后完整的 id 顺序**，
 * 不是"把第 3 个挪到第 5 个"这种指令——后者要在这里重演一遍位移逻辑，
 * 而那套逻辑界面上已经算过一次了，两份很快会对不上。
 *
 * 整组包在一个事务里：中途失败会让一半行是新号、一半是旧号，列表顺序当场错乱。
 */
export async function reorderCategories(orderedIds: string[]): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (let index = 0; index < orderedIds.length; index++) {
      await db.runAsync('UPDATE categories SET sortOrder = ?, synced = 0 WHERE id = ?', [index, orderedIds[index]]);
    }
  });
}

/**
 * 换一个父分类：`parentId = null` 是升成一级，传 id 是挂到那个一级分类下面。
 *
 * 三条前提在这里挡住，不靠界面自觉：
 * 1. 只有两层——自己底下还挂着子分类就不能再变成别人的子分类，否则出现三层
 * 2. 目标父必须是同收支类型的一级分类（后端 assertOwnedParent 是同一条规则）
 * 3. 不能挂到自己身上
 */
export async function moveCategory(id: string, parentId: string | null): Promise<void> {
  const db = await getDb();
  const category = await db.getFirstAsync<Category>('SELECT * FROM categories WHERE id = ?', [id]);
  if (!category) throw new Error('分类不存在');
  if ((category.parentId ?? null) === parentId) return;

  if (parentId) {
    if (parentId === id) throw new Error('不能把一个分类挂到它自己下面');

    const children = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM categories WHERE parentId = ?',
      [id],
    );
    if ((children?.count ?? 0) > 0) {
      throw new Error(`它下面还有 ${children!.count} 个子分类，分类只支持两层`);
    }

    const parent = await db.getFirstAsync<Category>('SELECT * FROM categories WHERE id = ?', [parentId]);
    if (!parent) throw new Error('目标分类不存在');
    if (parent.parentId) throw new Error('只能挂在一级分类下面');
    if (parent.type !== category.type) throw new Error('收入分类和支出分类不能混在一起');
  }

  // 落到新那一层的末尾。留着旧的 sortOrder 会让它插在新同伴中间某个说不清的位置
  const sortOrder = await nextSortOrder(db, category.type, parentId);
  await db.runAsync('UPDATE categories SET parentId = ?, sortOrder = ?, synced = 0 WHERE id = ?', [
    parentId,
    sortOrder,
    id,
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
  // 子分类要用户自己先删干净，不做级联：parentId 是外键，直接删父会留下指向空气的子行，
  // 而级联删除会让"删一个分类"顺手带走一堆没提示过的东西
  const children = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM categories WHERE parentId = ?',
    [id],
  );
  if ((children?.count ?? 0) > 0) {
    throw new Error(`还有 ${children!.count} 个子分类挂在它下面`);
  }
  await db.runAsync('DELETE FROM categories WHERE id = ?', [id]);
}
