-- Creem Test Mode orders are separate from the existing Stripe integration.
CREATE TABLE creem_orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  request_id TEXT NOT NULL,
  product_key TEXT NOT NULL CHECK (product_key = 'professional_headshots'),
  creem_product_id TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount = 999),
  currency TEXT NOT NULL CHECK (currency = 'USD'),
  mode TEXT NOT NULL CHECK (mode = 'test'),
  locale TEXT NOT NULL CHECK (locale IN ('en', 'zh')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'refunded', 'expired')),
  checkout_state TEXT NOT NULL DEFAULT 'new'
    CHECK (checkout_state IN ('new', 'creating', 'ready', 'uncertain')),
  checkout_id TEXT UNIQUE,
  checkout_url TEXT,
  creem_order_id TEXT UNIQUE,
  transaction_id TEXT UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  paid_at INTEGER,
  refunded_at INTEGER,
  UNIQUE (user_id, request_id)
);
CREATE INDEX creem_orders_user_created ON creem_orders(user_id, created_at DESC);

-- A pack is a purchased right, not evidence that any portraits were generated.
-- Future result delivery must bind its private files to this order-owned pack.
CREATE TABLE headshot_packs (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE REFERENCES creem_orders(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  photo_count INTEGER NOT NULL CHECK (photo_count = 4),
  redo_count INTEGER NOT NULL CHECK (redo_count = 1),
  granted_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE INDEX headshot_packs_user ON headshot_packs(user_id, granted_at DESC);

-- Event recording, the order transition and pack grant/revocation commit together.
CREATE TABLE creem_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  order_id TEXT NOT NULL REFERENCES creem_orders(id),
  mode TEXT NOT NULL CHECK (mode = 'test'),
  received_at INTEGER NOT NULL,
  processed_at INTEGER
);
