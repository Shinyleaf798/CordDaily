import { Router } from "express";
import * as controller from "../controllers/account.controller.js";

const router = Router();

router.get("/", controller.list);
router.post("/", controller.create);
// 同分类：/batch 要排在带 :id 的路由前面
router.post("/batch", controller.batchCreate);
router.put("/:id", controller.update);
router.delete("/:id", controller.remove);
router.get("/:id/balance", controller.balance);

export default router;
