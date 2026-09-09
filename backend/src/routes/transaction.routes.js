import { Router } from "express";
import * as controller from "../controllers/transaction.controller.js";

const router = Router();

// GET  /transactions?from=&to=&categoryId=&accountId=&type=
// POST /transactions/batch  — 离线同步：批量推送本地未同步交易，按客户端生成的 id 幂等去重
router.get("/", controller.list);
router.post("/batch", controller.batchCreate);
router.put("/:id", controller.update);
router.delete("/:id", controller.remove);

export default router;
