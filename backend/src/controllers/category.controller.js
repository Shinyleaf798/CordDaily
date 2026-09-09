import { z } from "zod";
import * as categoryService from "../services/category.service.js";
import { ok } from "../utils/response.js";

const createSchema = z.object({
  name: z.string().min(1),
  icon: z.string().optional(),
  type: z.enum(["INCOME", "EXPENSE"]),
  parentId: z.string().uuid().optional(),
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
