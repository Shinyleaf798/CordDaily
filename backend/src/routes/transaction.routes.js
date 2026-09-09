import { Router } from "express";
import { notImplemented } from "../utils/notImplemented.js";

const router = Router();

// GET  /transactions?from=&to=&categoryId=&accountId=&type=
// POST /transactions/batch  — 离线同步：批量推送本地未同步交易，按客户端生成的 id 幂等去重
router.get("/", notImplemented);
router.post("/batch", notImplemented);
router.put("/:id", notImplemented);
router.delete("/:id", notImplemented);

export default router;
