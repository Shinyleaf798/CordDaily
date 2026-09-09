import { z } from "zod";
import * as transferService from "../services/transfer.service.js";
import { ok } from "../utils/response.js";

const transferItemSchema = z.object({
  id: z.string().uuid(),
  amount: z.number().positive(),
  date: z.coerce.date(),
  note: z.string().optional(),
  fromAccountId: z.string().uuid(),
  toAccountId: z.string().uuid(),
});

const batchSchema = z.object({
  transfers: z.array(transferItemSchema).min(1),
});

export async function list(req, res, next) {
  try {
    ok(res, await transferService.list(req.userId));
  } catch (err) {
    next(err);
  }
}

export async function batchCreate(req, res, next) {
  try {
    const { transfers } = batchSchema.parse(req.body);
    ok(res, await transferService.batchCreate(req.userId, transfers), 201);
  } catch (err) {
    next(err);
  }
}
