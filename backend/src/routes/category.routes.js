import { Router } from "express";
import * as controller from "../controllers/category.controller.js";

const router = Router();

router.get("/", controller.list);
router.post("/", controller.create);
// 放在 "/:id" 之前：Express 按注册顺序匹配，反过来的话 POST /categories/batch
// 会先撞上某个 "/:id" 路由，把 "batch" 当成一个 id
router.post("/batch", controller.batchCreate);
router.put("/:id", controller.update);
router.delete("/:id", controller.remove);

export default router;
