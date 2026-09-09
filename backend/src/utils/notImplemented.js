import { ApiError } from "./response.js";

// 占位路由：接口清单已在 docs/PROJECT-PLAN.md 第4节定义，先搭好路由骨架，
// 具体业务逻辑（同步去重、预算计算、周期生成）留到实现该模块时再补
export function notImplemented(req, res, next) {
  next(new ApiError(501, "NOT_IMPLEMENTED", `${req.method} ${req.baseUrl}${req.path} is not implemented yet`));
}
