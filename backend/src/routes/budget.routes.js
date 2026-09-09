import { Router } from "express";
import * as controller from "../controllers/budget.controller.js";

const router = Router();

router.get("/", controller.list);
router.post("/", controller.upsert);
// GET /budgets/status?month=  — 各分类预算 vs 实际花费，供电脑端展示；手机端超支判断在本地算，不依赖这个接口
router.get("/status", controller.status);

export default router;
