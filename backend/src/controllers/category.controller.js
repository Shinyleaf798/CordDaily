import { z } from "zod";
import * as categoryService from "../services/category.service.js";
import { ok } from "../utils/response.js";

const createSchema = z.object({
  name: z.string().min(1),
  icon: z.string().optional(),
  type: z.enum(["INCOME", "EXPENSE"]),
  parentId: z.string().uuid().optional(),
  // 排序和启用状态都由手机端算好再推上来：排序是用户在手机上拖出来的结果，
  // 停用与否也是手机本地判断的（CLAUDE.md 核心原则#1，本地是唯一录入源头）。
  // 两个都 optional 且有库级默认值，老版本 App 不带这两个字段也能照常建分类
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

const updateSchema = createSchema.partial();

export async function list(req, res, next) {
  try {
    const categories = await categoryService.list(req.userId);
    ok(res, categories);
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const body = createSchema.parse(req.body);
    const category = await categoryService.create(req.userId, body);
    ok(res, category, 201);
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const body = updateSchema.parse(req.body);
    const category = await categoryService.update(req.userId, req.params.id, body);
    ok(res, category);
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    await categoryService.remove(req.userId, req.params.id);
    ok(res, null);
  } catch (err) {
    next(err);
  }
}
