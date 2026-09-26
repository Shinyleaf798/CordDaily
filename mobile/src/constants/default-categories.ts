import { builtinIconRef } from '@/constants/category-icons';

/**
 * 内置分类和内置账户的**固定 id**。
 *
 * 这些 UUID 写死在代码里，每台设备、每次重装都一样——这是整个「备份 / 恢复」能成立的地基。
 *
 * 为什么必须固定：默认分类原来是在 `seedDefaultCategories` 里现场 `Crypto.randomUUID()` 生成的，
 * 于是重装之后，新手机上那个「餐饮」跟备份文件里那个「餐饮」名字一样、图标一样、**id 完全不同**。
 * 恢复时每一行账单的 `categoryId` 都指向一个本机不存在的分类——本地 `PRAGMA foreign_keys`
 * 是关着的（见 `db/client.ts`），所以它会**静默存进去**，变成一堆点开是空白的行；
 * 要等推到服务器才被 Postgres 的外键打回。固定之后，恢复时这些行的 id 根本不用动，
 * 连用户改过的名字、停用状态都跟着回来（按 id upsert，见 `db/backup.ts`）。
 *
 * 三条硬规矩：
 *
 * 1. **必须是合法 UUID 格式**。后端的 zod 校验是 `z.string().uuid()`，
 *    写成 `builtin-food` 这种可读字符串的话，整批交易会在同步时被打回。
 * 2. **发布之后永不修改**。地位等同于一条已发布的数据库迁移：改一个字符，
 *    已经装过的设备上那些账单就全指向不存在的分类了。要加新的内置分类只能往后追加。
 * 3. **代码里不给内置分类开特例**。它只是"一个恰好每台设备都相同的 id"，
 *    同步、备份、排序、改名、停用全部走跟用户自建分类完全一样的路径。
 *    （曾经想过在云端给内置分类单开一张表，放弃了——那 13 个分类是可以被用户改名、
 *    停用、挪层级、拖排序的，一张全用户共享的只读表装不下这些编辑。见 DECISIONS.md）
 *
 * 代价记在这里：这批 id 在所有用户之间是共享的，所以服务器上 `Category` / `Account`
 * 的主键是 `@@id([userId, id])` 复合键，而不是全局唯一的 `id`。
 */

export type DefaultCategoryChild = {
  id: string;
  name: string;
  icon: string;
};

export type DefaultCategory = {
  id: string;
  name: string;
  icon: string;
  type: 'INCOME' | 'EXPENSE';
  children?: DefaultCategoryChild[];
};

// 顺序就是它们在记账页网格里的先后（sortOrder 按收支类型各自从 0 数起）
export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  {
    id: '98a9446c-a382-465c-aa05-d48542f62130',
    name: '餐饮',
    icon: builtinIconRef('food'),
    type: 'EXPENSE',
    children: [
      { id: '499ff652-cfc3-4dcc-a5fe-045a7360a094', name: '早餐', icon: builtinIconRef('food') },
      { id: 'd4d8bc38-5d16-46c0-aa11-6b2ff94daeb9', name: '午餐', icon: builtinIconRef('food') },
      { id: 'a067b01b-bfd6-47af-91e4-22a14b9f78b8', name: '晚餐', icon: builtinIconRef('food') },
      { id: '6db1695a-1027-4641-a7d8-98d026f50a4d', name: '外卖', icon: builtinIconRef('food') },
      { id: '9881960b-feae-460f-a76f-4b72788bf392', name: '饮料', icon: builtinIconRef('food') },
    ],
  },
  {
    id: '9e45ff7b-f88d-4e49-a52e-3d806db85022',
    name: '购物',
    icon: builtinIconRef('shopping'),
    type: 'EXPENSE',
    children: [
      { id: '9aac06e7-922b-4f34-adde-ff9d894594cf', name: '服饰', icon: builtinIconRef('shopping') },
      { id: '04dcd8d2-9176-4505-ba11-176a5ec7851e', name: '日用品', icon: builtinIconRef('daily') },
      { id: '9a81be4d-53ac-4d67-b1de-588cc6322d5f', name: '数码', icon: builtinIconRef('shopping') },
    ],
  },
  {
    id: '281e1696-1d80-49a7-be3d-bb1fdfbf779e',
    name: '交通',
    icon: builtinIconRef('transport'),
    type: 'EXPENSE',
    children: [
      { id: 'dcaa89dd-ec14-4667-8365-86fb93532619', name: '打车', icon: builtinIconRef('transport') },
      { id: 'd119430f-faf5-4880-ab37-0aa0ea4664f4', name: '公交', icon: builtinIconRef('transport') },
      { id: '3ed7810a-f2dc-4aa8-920a-dc58855266f4', name: '加油', icon: builtinIconRef('transport') },
      { id: 'c4e6821b-0fb0-42e2-be3f-714e76dc8eea', name: '停车', icon: builtinIconRef('transport') },
    ],
  },
  { id: '868231ea-deda-4605-811e-290b02a3519e', name: '日常', icon: builtinIconRef('daily'), type: 'EXPENSE' },
  {
    id: 'bf7c071d-aa34-4e04-ab80-7ccd98d1cf5e',
    name: '娱乐',
    icon: builtinIconRef('entertainment'),
    type: 'EXPENSE',
    children: [
      { id: 'e0aff983-ab43-4fb1-862d-fd643f831cd5', name: '电影', icon: builtinIconRef('entertainment') },
      { id: '21bc7b0d-99ce-47dc-93ac-7f33926593cc', name: '游戏', icon: builtinIconRef('entertainment') },
      { id: '6dfa15a0-3433-4074-a674-3363ff93319f', name: '旅行', icon: builtinIconRef('travel') },
    ],
  },
  { id: 'f9b687df-d0c3-47bb-9e67-674bf3d78914', name: '医疗', icon: builtinIconRef('medical'), type: 'EXPENSE' },
  { id: '6ed8f28d-92c4-4b1e-88d2-948dd2a59d9f', name: '学习', icon: builtinIconRef('study'), type: 'EXPENSE' },
  { id: 'bbdadedb-86ad-4812-bc4b-4d71a0f2b80f', name: '社交', icon: builtinIconRef('social'), type: 'EXPENSE' },
  { id: '13492f65-d355-4572-89fe-cdcd75dd76d5', name: '其他', icon: builtinIconRef('other'), type: 'EXPENSE' },

  { id: '1b15a694-6fd0-4fc1-bfc4-970b1b437335', name: '工资', icon: builtinIconRef('salary'), type: 'INCOME' },
  { id: '5f1340ea-ceb3-43aa-bc34-e90eb3228cb2', name: '奖金', icon: builtinIconRef('bonus'), type: 'INCOME' },
  { id: '0d2a56bf-1a2e-42c3-9684-e78f10c39ac6', name: '兼职', icon: builtinIconRef('parttime'), type: 'INCOME' },
  { id: '01595110-f89b-4ba3-970e-e9af25c599bb', name: '其他收入', icon: builtinIconRef('refund'), type: 'INCOME' },
];

/**
 * 两个内置账户。
 *
 * 「不选择任何账户」的 id 以前是随机生成、记在 `app_settings.noAccountId` 里的，
 * 当时不敢写死的理由是「account.id 是全局主键，两个用户一同步就撞」——
 * 现在服务器改成了 `@@id([userId, id])`，这个顾虑没有了，跟分类同样处理。
 * 那个设置键连同 accounts.ts 里两个重复的 getSetting/setSetting 一起删掉了：
 * 「哪一行是兜底账户」现在就是"id 等于下面这个常量的那一行"。
 */
export const DEFAULT_ACCOUNTS = {
  noAccount: { id: 'ac0d257e-9b89-4968-8ffd-208120a7f2cc', name: '不选择任何账户' },
  cash: { id: '76ee66a4-724c-41c1-aca5-72e21281ab89', name: '现金' },
} as const;

/** 拍平成一维，给迁移和备份逻辑用 */
export const DEFAULT_CATEGORIES_FLAT: { id: string; name: string; type: 'INCOME' | 'EXPENSE'; parentId: string | null }[] =
  DEFAULT_CATEGORIES.flatMap((category) => [
    { id: category.id, name: category.name, type: category.type, parentId: null },
    ...(category.children ?? []).map((child) => ({
      id: child.id,
      name: child.name,
      type: category.type,
      parentId: category.id,
    })),
  ]);

/** 这个 id 是不是内置的。目前只有备份的统计口径用得上，判断逻辑本身不改变任何行为 */
export function isBuiltinCategoryId(id: string): boolean {
  return DEFAULT_CATEGORIES_FLAT.some((category) => category.id === id);
}
