ALTER TABLE "certificate_configs" ADD COLUMN "paymentTiers" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
