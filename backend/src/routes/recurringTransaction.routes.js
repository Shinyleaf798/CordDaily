import { Router } from "express";
import { notImplemented } from "../utils/notImplemented.js";

const router = Router();

router.get("/", notImplemented);
router.post("/", notImplemented);
// PUT 也用于暂停规则（isActive=false），不单独开 pause 接口
router.put("/:id", notImplemented);
router.delete("/:id", notImplemented);

export default router;
