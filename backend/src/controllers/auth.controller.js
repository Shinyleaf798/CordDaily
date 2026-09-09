import { z } from "zod";
import * as authService from "../services/auth.service.js";
import { ok } from "../utils/response.js";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export async function register(req, res, next) {
  try {
    const body = registerSchema.parse(req.body);
    const result = await authService.register(body);
    ok(res, result, 201);
  } catch (err) {
    next(err);
  }
}

export async function login(req, res, next) {
  try {
    const body = loginSchema.parse(req.body);
    const result = await authService.login(body);
    ok(res, result);
  } catch (err) {
    next(err);
  }
}

export async function refresh(req, res, next) {
  try {
    const { refreshToken } = refreshSchema.parse(req.body);
    const result = await authService.refresh(refreshToken);
    ok(res, result);
  } catch (err) {
    next(err);
  }
}

export async function me(req, res, next) {
  try {
    const user = await authService.getMe(req.userId);
    ok(res, user);
  } catch (err) {
    next(err);
  }
}
