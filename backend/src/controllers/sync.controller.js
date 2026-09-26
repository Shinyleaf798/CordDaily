import * as syncService from "../services/sync.service.js";
import { ok } from "../utils/response.js";

// 恢复这条路只有两个只读接口：先问「云端有没有东西」（summary），
// 用户点了恢复再拉整包（bundle）。分两个是因为重装后那句
// 「云端有 1,284 笔账单，要恢复吗」得在拉几百 KB 之前就问得出口。
export async function bundle(req, res, next) {
  try {
    ok(res, await syncService.getBundle(req.userId));
  } catch (err) {
    next(err);
  }
}

export async function summary(req, res, next) {
  try {
    ok(res, await syncService.getSummary(req.userId));
  } catch (err) {
    next(err);
  }
}
