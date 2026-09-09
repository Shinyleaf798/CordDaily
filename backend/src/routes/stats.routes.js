import { Router } from "express";
import { notImplemented } from "../utils/notImplemented.js";

const router = Router();

// 只读聚合，供电脑端图表使用；GROUP BY / SUM 在 SQL 层做，不在应用层拉全表再算
router.get("/summary", notImplemented);
router.get("/by-category", notImplemented);

export default router;
