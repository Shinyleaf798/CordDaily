import jwt from "jsonwebtoken";
import prisma from "../config/prisma.js";
import env from "../config/env.js";
import { ApiError } from "../utils/response.js";

// 校验 access token；15分钟过期是有意设计得短，配合 refresh token 换新，降低泄露窗口
//
// 光验签不够，还要确认这个用户**现在还在**：token 是自包含的，签发之后数据库里发生了什么它一概不知。
// 开发期清库（migrate reset 会连 User 表一起清掉）之后，手机上那个 token 仍然验得过，
// 于是每个写请求都带着一个不存在的 userId 打进来，最后炸在外键上——
// 用户看到的是 500 加一堆 Prisma 堆栈，而真正的原因是"你的会话指向一个已经没有的账号"。
// 以后做注销账号也是同一件事。
//
// 代价是每个需要登录的请求多一次主键查询。换来的是：这里返回 401 之后，
// 手机端的 axios 拦截器会去换 token，/auth/refresh 同样查不到这个用户、同样 401，
// 于是会话被清掉、跳回登录页——一条已经存在的、正确的路。
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return next(new ApiError(401, "UNAUTHORIZED", "Missing access token"));
  }

  let payload;
  try {
    payload = jwt.verify(token, env.jwt.accessSecret);
  } catch (err) {
    return next(new ApiError(401, "UNAUTHORIZED", "Invalid or expired access token"));
  }

  // 查库放在 try 外面：它失败是"数据库出问题"，不该被报成"token 无效"
  try {
    const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true } });
    if (!user) {
      return next(new ApiError(401, "UNAUTHORIZED", "Account no longer exists, please sign in again"));
    }
    req.userId = user.id;
    next();
  } catch (err) {
    next(err);
  }
}
