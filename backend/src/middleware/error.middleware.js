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

  console.error(err);
  return res.status(500).json({
    success: false,
    data: null,
    error: { code: "INTERNAL_ERROR", message: "Something went wrong" },
  });
}
