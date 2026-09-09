import { Router } from "express";
import * as controller from "../controllers/transfer.controller.js";

const router = Router();

router.get("/", controller.list);
// POST /transfers/batch — 离线同步：批量推送转账记录，同样按客户端 id 幂等去重
router.post("/batch", controller.batchCreate);

export default router;
