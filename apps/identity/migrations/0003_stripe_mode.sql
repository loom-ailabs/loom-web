-- Existing orders and webhook records were created in Stripe Sandbox.
ALTER TABLE orders ADD COLUMN stripe_mode TEXT NOT NULL DEFAULT 'test'
  CHECK (stripe_mode IN ('test', 'live'));

ALTER TABLE stripe_events ADD COLUMN stripe_mode TEXT NOT NULL DEFAULT 'test'
  CHECK (stripe_mode IN ('test', 'live'));
