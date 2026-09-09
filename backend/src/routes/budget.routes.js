import { Router } from "express";
import { notImplemented } from "../utils/notImplemented.js";

const router = Router();

router.get("/", notImplemented);
router.post("/", notImplemented);
// GET /budgets/status?month=  — 各分类预算 vs 实际花费，供电脑端展示；手机端超支判断在本地算，不依赖这个接口
router.get("/status", notImplemented);

export default router;
