import { z } from "zod";
import * as statsService from "../services/stats.service.js";
import { ok } from "../utils/response.js";

const monthQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "month must be in YYYY-MM format"),
});

const byCategoryQuerySchema = monthQuerySchema.extend({
  type: z.enum(["INCOME", "EXPENSE"]).default("EXPENSE"),
});

export async function summary(req, res, next) {
  try {
    const { month } = monthQuerySchema.parse(req.query);
    ok(res, await statsService.summary(req.userId, month));
  } catch (err) {
    next(err);
  }
}

export async function byCategory(req, res, next) {
  try {
    const { month, type } = byCategoryQuerySchema.parse(req.query);
    ok(res, await statsService.byCategory(req.userId, month, type));
  } catch (err) {
    next(err);
  }
}
