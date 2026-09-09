import jwt from "jsonwebtoken";
import env from "../config/env.js";
import { ApiError } from "../utils/response.js";

// 校验 access token；15分钟过期是有意设计得短，配合 refresh token 换新，降低泄露窗口
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return next(new ApiError(401, "UNAUTHORIZED", "Missing access token"));
  }

  try {
    const payload = jwt.verify(token, env.jwt.accessSecret);
    req.userId = payload.sub;
    next();
  } catch (err) {
    next(new ApiError(401, "UNAUTHORIZED", "Invalid or expired access token"));
  }
}
