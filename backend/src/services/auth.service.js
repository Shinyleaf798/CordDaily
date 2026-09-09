import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import prisma from "../config/prisma.js";
import env from "../config/env.js";
import { ApiError } from "../utils/response.js";

const SALT_ROUNDS = 10;

function signAccessToken(userId) {
  return jwt.sign({ sub: userId }, env.jwt.accessSecret, {
    expiresIn: env.jwt.accessExpiresIn,
  });
}

function signRefreshToken(userId) {
  return jwt.sign({ sub: userId }, env.jwt.refreshSecret, {
    expiresIn: env.jwt.refreshExpiresIn,
  });
}

export async function register({ email, password, name }) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new ApiError(409, "EMAIL_TAKEN", "This email is already registered");
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await prisma.user.create({
    data: { email, passwordHash, name },
  });

  return {
    user: toPublicUser(user),
    accessToken: signAccessToken(user.id),
    refreshToken: signRefreshToken(user.id),
  };
}

export async function login({ email, password }) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect");
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect");
  }

  return {
    user: toPublicUser(user),
    accessToken: signAccessToken(user.id),
    refreshToken: signRefreshToken(user.id),
  };
}

// refresh token 只用来换新 access token，不签发新的 refresh token（保持简单，过期后需要重新登录）
export async function refresh(refreshToken) {
  let payload;
  try {
    payload = jwt.verify(refreshToken, env.jwt.refreshSecret);
  } catch (err) {
    throw new ApiError(401, "UNAUTHORIZED", "Invalid or expired refresh token");
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) {
    throw new ApiError(401, "UNAUTHORIZED", "User no longer exists");
  }

  return { accessToken: signAccessToken(user.id) };
}

export async function getMe(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new ApiError(404, "NOT_FOUND", "User not found");
  }
  return toPublicUser(user);
}

function toPublicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    baseCurrency: user.baseCurrency,
    createdAt: user.createdAt,
  };
}
