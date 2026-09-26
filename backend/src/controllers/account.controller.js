import { z } from "zod";
import * as accountService from "../services/account.service.js";
import { ok } from "../utils/response.js";

const createSchema = z.object({
  // 跟分类同一个问题：原来没有 id，服务器自己生成，手机推上来的账单会指向一个不存在的账户
  id: z.string().uuid(),
  name: z.string().min(1),
  type: z.enum(["CASH", "BANK", "EWALLET", "CREDIT_CARD", "OTHER"]),
  currency: z.string().default("MYR"),
  openingBalance: z.number().default(0),
  icon: z.string().optional(),
});

const updateSchema = createSchema.omit({ id: true }).partial();

export async function list(req, res, next) {
  try {
    ok(res, await accountService.list(req.userId));
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const body = createSchema.parse(req.body);
    ok(res, await accountService.create(req.userId, body), 201);
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const body = updateSchema.parse(req.body);
    ok(res, await accountService.update(req.userId, req.params.id, body));
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    await accountService.remove(req.userId, req.params.id);
    ok(res, null);
  } catch (err) {
    next(err);
  }
}

export async function balance(req, res, next) {
  try {
    ok(res, await accountService.getBalance(req.userId, req.params.id));
  } catch (err) {
    next(err);
  }
}
