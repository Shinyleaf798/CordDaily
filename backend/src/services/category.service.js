import prisma from "../config/prisma.js";
import { ApiError } from "../utils/response.js";

// 按手机端排出来的顺序返回，电脑端画出来的分类次序才跟手机上看到的一样。
// sortOrder 同值时用名字兜底：老数据整批是 0，没有第二个键的话顺序全凭数据库心情
export async function list(userId) {
  return prisma.category.findMany({
    where: { userId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

// 跟账户同一个道理：id 由手机端生成，13 个内置分类的 id 更是全用户共用的常量，
// 所以主键是 (userId, id)，而且这里是 upsert——重推一次只会把那一行更新成最新的样子
export async function create(userId, { id, ...data }) {
  if (data.parentId) {
    await assertOwnedParent(userId, data.parentId);
  }
  return prisma.category.upsert({
    where: { userId_id: { userId, id } },
    create: { ...data, id, userId },
    update: data,
  });
}

/**
 * 同步入口：一整批分类一次推上来。
 *
 * 为什么要这个端点——原来同步是一条一个 POST，理由是"分类数量小，只在第一次全量走一遍"。
 * 这个前提后来不成立了：内置分类从 13 涨到 36，而且**拖一次排序会把那一层整层标脏**
 * （手机端按新次序重新编号，见 mobile/src/db/categories.ts 的 reorderCategories），
 * 于是一次很普通的操作就要几十个来回，慢的全是网络往返，不是数据量。
 *
 * **不包事务**。36 次 upsert 放进 Prisma 的交互式事务，默认 5 秒超时在 Neon 这种
 * serverless Postgres 上是真的会撞上的，而它换不来什么：这批写全是按 (userId, id) 的 upsert，
 * 半途失败时手机端不会 markSynced，下次整批重推的结果跟第一次完全一样。
 * 用超时风险去买一个不需要的原子性，不划算。
 *
 * 父先写、子后写，跟单条那条路的顺序要求一样——子的 parentId 是外键。
 * 校验也放在父写完之后做，这样"父子在同一批里"才成立。
 */
export async function batchCreate(userId, items) {
  const ids = items.map((item) => item.id);
  const existing = await prisma.category.findMany({
    where: { userId, id: { in: ids } },
    select: { id: true },
  });
  const existedBefore = new Set(existing.map((category) => category.id));

  const parents = items.filter((item) => !item.parentId);
  const children = items.filter((item) => item.parentId);

  for (const { id, ...data } of parents) {
    await prisma.category.upsert({
      where: { userId_id: { userId, id } },
      create: { ...data, id, userId },
      update: data,
    });
  }

  // 一次把这批孩子用到的父全查回来，而不是每个孩子查一次：
  // 校验要读的是**父写完之后**的状态，所以必须在上面那个循环之后
  const parentIds = [...new Set(children.map((child) => child.parentId))];
  const found = parentIds.length
    ? await prisma.category.findMany({
        where: { userId, id: { in: parentIds } },
        select: { id: true, parentId: true },
      })
    : [];
  const parentById = new Map(found.map((parent) => [parent.id, parent]));

  for (const child of children) {
    if (child.parentId === child.id) {
      throw new ApiError(400, "INVALID_PARENT", "A category cannot be its own parent");
    }
    const parent = parentById.get(child.parentId);
    if (!parent) {
      throw new ApiError(400, "INVALID_PARENT", "Parent category not found");
    }
    if (parent.parentId) {
      throw new ApiError(400, "INVALID_PARENT", "Categories only support two levels");
    }
  }

  for (const { id, ...data } of children) {
    await prisma.category.upsert({
      where: { userId_id: { userId, id } },
      create: { ...data, id, userId },
      update: data,
    });
  }

  return { inserted: items.length - existedBefore.size, updated: existedBefore.size };
}

export async function update(userId, id, data) {
  await assertOwned(userId, id);
  if (data.parentId) {
    if (data.parentId === id) {
      throw new ApiError(400, "INVALID_PARENT", "A category cannot be its own parent");
    }
    await assertOwnedParent(userId, data.parentId);
  }
  return prisma.category.update({ where: { userId_id: { userId, id } }, data });
}

export async function remove(userId, id) {
  await assertOwned(userId, id);
  await prisma.category.delete({ where: { userId_id: { userId, id } } });
}

async function assertOwned(userId, id) {
  const category = await prisma.category.findFirst({ where: { id, userId } });
  if (!category) {
    throw new ApiError(404, "NOT_FOUND", "Category not found");
  }
  return category;
}

async function assertOwnedParent(userId, parentId) {
  const parent = await prisma.category.findFirst({ where: { id: parentId, userId } });
  if (!parent) {
    throw new ApiError(400, "INVALID_PARENT", "Parent category not found");
  }
  if (parent.parentId) {
    throw new ApiError(400, "INVALID_PARENT", "Categories only support two levels");
  }
}
