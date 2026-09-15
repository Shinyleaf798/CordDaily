-- 交易表补上录入表单需要的三列：
--   merchant / location  店名和地点（可复用，客户端靠 DISTINCT 做历史补全）
--   reimbursedAt         报销的第二态：null=待收回，有值=已收回
-- 三列都可空，对已有行无影响，不需要 backfill。
-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "merchant" TEXT,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "reimbursedAt" TIMESTAMP(3);
