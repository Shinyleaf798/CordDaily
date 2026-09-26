import { Router } from "express";
import * as controller from "../controllers/sync.controller.js";

const router = Router();

router.get("/bundle", controller.bundle);
router.get("/summary", controller.summary);

export default router;
