import { Router } from "express";
import * as controller from "../controllers/categoryIcon.controller.js";

const router = Router();

// 云端已有哪些图标，只回名字——手机端据此决定这次要传哪几张
router.get("/", controller.list);
router.post("/batch", controller.batchUpload);
// 按名字取回几张。手机端合并完云端的分类之后，用它补齐本地缺的图
router.post("/fetch", controller.fetchByNames);

export default router;
