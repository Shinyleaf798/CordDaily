import { ZodError } from "zod";
import { ApiError } from "../utils/response.js";

export function notFoundHandler(req, res, next) {
  next(new ApiError(404, "NOT_FOUND", `Route not found: ${req.method} ${req.originalUrl}`));
}

// 统一错误出口：所有 controller 的异常最终都落到这里，格式化成 { success:false, error:{code,message} }
export function errorHandler(err, req, res, next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({
      success: false,
      data: null,
      error: { code: err.code, message: err.message },
    });
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      data: null,
      error: { code: "VALIDATION_ERROR", message: err.issues.map((i) => i.message).join(", ") },
    });
  }

  // body-parser 在解析请求体时抛的错（体积超限、JSON 语法坏了）。
  // 它们自带 status 和一个 `type`，但既不是 ApiError 也不是 ZodError，
  // 不认出来的话会掉进下面的 500——用户传了一张超大的分类图标，
  // 看到的是 "Something went wrong"，既不知道是自己的图太大，也不知道多大才算大
  const bodyErrorStatus = err?.status ?? err?.statusCode;
  if (err?.type && bodyErrorStatus >= 400 && bodyErrorStatus < 500) {
    const code = err.type === "entity.too.large" ? "PAYLOAD_TOO_LARGE" : "INVALID_BODY";
    return res.status(bodyErrorStatus).json({
      success: false,
      data: null,
      error: { code, message: err.message },
    });
  }

  console.error(err);
  return res.status(500).json({
    success: false,
    data: null,
    error: { code: "INTERNAL_ERROR", message: "Something went wrong" },
  });
}
