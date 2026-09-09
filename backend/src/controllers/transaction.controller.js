import { z } from "zod";
import * as transactionService from "../services/transaction.service.js";
import { ok } from "../utils/response.js";

const imageSchema = z.object({ url: z.string().url() });

const transactionItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  remarks: z.string().optional(),
  amount: z.number(),
  currency: z.string().default("MYR"),
  exchangeRate: z.number().default(1),
  amountInBase: z.number(),
  type: z.enum(["INCOME", "EXPENSE"]),
  date: z.coerce.date(),
  categoryId: z.string().uuid(),
  accountId: z.string().uuid(),
  recurringId: z.string().uuid().optional(),
  tags: z.array(z.string()).default([]),
  isReimbursable: z.boolean().default(false),
  excludeFromStats: z.boolean().default(false),
  images: z.array(imageSchema).default([]),
});

const batchSchema = z.object({
  transactions: z.array(transactionItemSchema).min(1),
});

const listQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  categoryId: z.string().uuid().optional(),
  accountId: z.string().uuid().optional(),
  type: z.enum(["INCOME", "EXPENSE"]).optional(),
});

const updateSchema = transactionItemSchema.omit({ id: true, images: true }).partial();

export async function list(req, res, next) {
  try {
    const filters = listQuerySchema.parse(req.query);
    ok(res, await transactionService.list(req.userId, filters));
  } catch (err) {
    next(err);
  }
}

export async function batchCreate(req, res, next) {
  try {
    const { transactions } = batchSchema.parse(req.body);
    ok(res, await transactionService.batchCreate(req.userId, transactions), 201);
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const body = updateSchema.parse(req.body);
    ok(res, await transactionService.update(req.userId, req.params.id, body));
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    await transactionService.remove(req.userId, req.params.id);
    ok(res, null);
  } catch (err) {
    next(err);
  }
}
