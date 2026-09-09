import { z } from "zod";
import * as recurringService from "../services/recurringTransaction.service.js";
import { ok } from "../utils/response.js";

const createSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  remarks: z.string().optional(),
  amount: z.number(),
  currency: z.string().default("MYR"),
  exchangeRate: z.number().default(1),
  type: z.enum(["INCOME", "EXPENSE"]),
  frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]),
  startDate: z.coerce.date(),
  nextRunDate: z.coerce.date(),
  endDate: z.coerce.date().optional(),
  isActive: z.boolean().default(true),
  categoryId: z.string().uuid(),
  accountId: z.string().uuid(),
});

// PUT 也用来暂停规则（isActive:false），所以更新时所有字段都可选，id 不可改
const updateSchema = createSchema.omit({ id: true }).partial();

export async function list(req, res, next) {
  try {
    ok(res, await recurringService.list(req.userId));
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const body = createSchema.parse(req.body);
    ok(res, await recurringService.create(req.userId, body), 201);
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const body = updateSchema.parse(req.body);
    ok(res, await recurringService.update(req.userId, req.params.id, body));
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    await recurringService.remove(req.userId, req.params.id);
    ok(res, null);
  } catch (err) {
    next(err);
  }
}
