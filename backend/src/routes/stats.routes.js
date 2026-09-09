import { Router } from "express";
import * as controller from "../controllers/stats.controller.js";

const router = Router();

// 只读聚合，供电脑端图表使用；GROUP BY / SUM 在 SQL 层做，不在应用层拉全表再算
router.get("/summary", controller.summary);
router.get("/by-category", controller.byCategory);

export default router;
