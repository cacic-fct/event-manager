CREATE OR REPLACE FUNCTION validate_price_tiers()
RETURNS TRIGGER AS $$
DECLARE
  tier_count INT;
  price_type TEXT;
BEGIN
  SELECT COUNT(*) INTO tier_count
  FROM price_tiers
  WHERE "priceId" = NEW.id;

  SELECT type INTO price_type
  FROM major_event_prices
  WHERE id = NEW.id;

  IF price_type = 'SINGLE' AND tier_count <> 1 THEN
    RAISE EXCEPTION 'SINGLE price must have exactly 1 tier';
  END IF;

  IF price_type = 'TIERED' AND tier_count < 1 THEN
    RAISE EXCEPTION 'TIERED price must have at least 1 tier';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION enforce_payment_info()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."isPaymentRequired" = true THEN
    IF NOT EXISTS (
      SELECT 1 FROM payment_info WHERE "majorEventId" = NEW.id
    ) THEN
      RAISE EXCEPTION 'Payment info required';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_payment_info
AFTER INSERT OR UPDATE ON major_events
FOR EACH ROW
EXECUTE FUNCTION enforce_payment_info();


ALTER TABLE major_event_subscriptions
ADD CONSTRAINT amount_paid_positive
CHECK ("amountPaid" IS NULL OR "amountPaid" >= 0);


CREATE UNIQUE INDEX event_subscription_unique_active
ON event_subscriptions ("eventId", "personId")
WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX major_event_subscription_unique
ON major_event_subscriptions ("majorEventId", "personId");

ALTER TABLE events
ADD CONSTRAINT events_date_check
CHECK ("startDate" <= "endDate");

ALTER TABLE major_events
ADD CONSTRAINT major_events_date_check
CHECK ("startDate" <= "endDate");
