ALTER TABLE "ticket_configs" ADD COLUMN "purchaseLimit" INTEGER;

ALTER TABLE "ticket_configs" ADD CONSTRAINT "ticket_configs_purchase_limit_positive"
  CHECK ("purchaseLimit" IS NULL OR "purchaseLimit" > 0);
