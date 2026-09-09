import { Router } from "express";
import { notImplemented } from "../utils/notImplemented.js";

const router = Router();

router.get("/", notImplemented);
// POST /transfers/batch — 离线同步：批量推送转账记录，同样按客户端 id 幂等去重
router.post("/batch", notImplemented);

export default router;
