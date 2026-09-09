import { Router } from "express";
import * as controller from "../controllers/recurringTransaction.controller.js";

const router = Router();

router.get("/", controller.list);
router.post("/", controller.create);
// PUT 也用于暂停规则（isActive=false），不单独开 pause 接口
router.put("/:id", controller.update);
router.delete("/:id", controller.remove);

export default router;
