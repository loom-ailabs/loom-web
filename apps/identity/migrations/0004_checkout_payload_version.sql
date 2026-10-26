-- Keep retries for existing Checkout requests on their original payload format.
ALTER TABLE orders ADD COLUMN checkout_payload_version INTEGER NOT NULL DEFAULT 1
  CHECK (checkout_payload_version IN (1, 2));
