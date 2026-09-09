import { z } from "zod";
import * as budgetService from "../services/budget.service.js";
import { ok } from "../utils/response.js";

const upsertSchema = z.object({
  categoryId: z.string().uuid(),
  amount: z.number().positive(),
});

const monthQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "month must be in YYYY-MM format"),
});

export async function list(req, res, next) {
  try {
    ok(res, await budgetService.list(req.userId));
  } catch (err) {
    next(err);
  }
}

export async function upsert(req, res, next) {
  try {
    const body = upsertSchema.parse(req.body);
    ok(res, await budgetService.upsert(req.userId, body), 201);
  } catch (err) {
    next(err);
  }
}

export async function status(req, res, next) {
  try {
    const { month } = monthQuerySchema.parse(req.query);
    ok(res, await budgetService.status(req.userId, month));
  } catch (err) {
    next(err);
  }
}
