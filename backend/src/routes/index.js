import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";

import authRoutes from "./auth.routes.js";
import categoryRoutes from "./category.routes.js";
import accountRoutes from "./account.routes.js";
import transactionRoutes from "./transaction.routes.js";
import recurringTransactionRoutes from "./recurringTransaction.routes.js";
import transferRoutes from "./transfer.routes.js";
import statsRoutes from "./stats.routes.js";
import syncRoutes from "./sync.routes.js";

const router = Router();

router.use("/auth", authRoutes);

// 以下均需登录
router.use("/categories", requireAuth, categoryRoutes);
router.use("/accounts", requireAuth, accountRoutes);
router.use("/transactions", requireAuth, transactionRoutes);
router.use("/recurring-transactions", requireAuth, recurringTransactionRoutes);
router.use("/transfers", requireAuth, transferRoutes);
router.use("/stats", requireAuth, statsRoutes);
// 恢复用的两个只读接口，见 services/sync.service.js
router.use("/sync", requireAuth, syncRoutes);

export default router;
