import prisma from "../config/prisma.js";
import { ApiError } from "../utils/response.js";

export async function list(userId) {
  return prisma.category.findMany({
    where: { userId },
    orderBy: { name: "asc" },
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
