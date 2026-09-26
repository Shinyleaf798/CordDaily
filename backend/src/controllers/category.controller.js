import { z } from "zod";
import * as categoryService from "../services/category.service.js";
import { ok } from "../utils/response.js";

const createSchema = z.object({
  // id 由手机端生成（CLAUDE.md 原则#2）。这里原来没有这个字段，服务器用 @default(uuid())
  // 自己生了一个——那意味着手机上那个 categoryId 在服务器上根本不存在，
  // 同步账单时整批会被外键打回。交易、转账、周期规则三个接口一直是收 id 的，只有这里漏了
  id: z.string().uuid(),
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

// 改一条分类时 id 不能变：它是同步幂等的依据
const updateSchema = createSchema.omit({ id: true }).partial();

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
