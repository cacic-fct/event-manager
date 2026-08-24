CREATE TABLE "event_form_link_price_tiers" (
    "linkId" TEXT NOT NULL,
    "priceTierId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_form_link_price_tiers_pkey" PRIMARY KEY ("linkId", "priceTierId")
);

CREATE INDEX "event_form_link_price_tiers_priceTierId_idx"
ON "event_form_link_price_tiers"("priceTierId");

ALTER TABLE "event_form_link_price_tiers"
ADD CONSTRAINT "event_form_link_price_tiers_linkId_fkey"
FOREIGN KEY ("linkId") REFERENCES "event_form_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_form_link_price_tiers"
ADD CONSTRAINT "event_form_link_price_tiers_priceTierId_fkey"
FOREIGN KEY ("priceTierId") REFERENCES "price_tiers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
