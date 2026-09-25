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

export async function create(userId, data) {
  if (data.parentId) {
    await assertOwnedParent(userId, data.parentId);
  }
  return prisma.category.create({ data: { ...data, userId } });
}

export async function update(userId, id, data) {
  await assertOwned(userId, id);
  if (data.parentId) {
    if (data.parentId === id) {
      throw new ApiError(400, "INVALID_PARENT", "A category cannot be its own parent");
    }
    await assertOwnedParent(userId, data.parentId);
  }
  return prisma.category.update({ where: { id }, data });
}

export async function remove(userId, id) {
  await assertOwned(userId, id);
  await prisma.category.delete({ where: { id } });
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
