-- D1 applies each migration in a transaction. Keep foreign-key checks deferred
-- while rebuilding this family of tables. Copy the children with references to
-- the new parent before dropping the old children and parent. Dropping a parent
-- first leaves SQLite's deferred violation counter non-zero even after a rename.
PRAGMA defer_foreign_keys = ON;

CREATE TABLE creem_orders_expanded (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  request_id TEXT NOT NULL,
  product_key TEXT NOT NULL,
  creem_product_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
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
  CHECK ((product_key = 'professional_headshots' AND amount = 999)
    OR (product_key = 'loom_pro' AND amount = 100)),
  UNIQUE (user_id, request_id)
);

INSERT INTO creem_orders_expanded
  (id, user_id, request_id, product_key, creem_product_id, amount, currency, mode, locale,
   status, checkout_state, checkout_id, checkout_url, creem_order_id, transaction_id,
   created_at, updated_at, paid_at, refunded_at)
SELECT id, user_id, request_id, product_key, creem_product_id, amount, currency, mode, locale,
   status, checkout_state, checkout_id, checkout_url, creem_order_id, transaction_id,
   created_at, updated_at, paid_at, refunded_at
FROM creem_orders;

CREATE TABLE headshot_packs_expanded (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE REFERENCES creem_orders_expanded(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  photo_count INTEGER NOT NULL CHECK (photo_count = 4),
  redo_count INTEGER NOT NULL CHECK (redo_count = 1),
  granted_at INTEGER NOT NULL,
  revoked_at INTEGER
);
INSERT INTO headshot_packs_expanded
  (id, order_id, user_id, photo_count, redo_count, granted_at, revoked_at)
SELECT id, order_id, user_id, photo_count, redo_count, granted_at, revoked_at
FROM headshot_packs;

CREATE TABLE creem_events_expanded (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  order_id TEXT NOT NULL REFERENCES creem_orders_expanded(id),
  mode TEXT NOT NULL CHECK (mode = 'test'),
  received_at INTEGER NOT NULL,
  processed_at INTEGER
);
INSERT INTO creem_events_expanded (id, type, order_id, mode, received_at, processed_at)
SELECT id, type, order_id, mode, received_at, processed_at FROM creem_events;

DROP TABLE headshot_packs;
DROP TABLE creem_events;
DROP TABLE creem_orders;
ALTER TABLE creem_orders_expanded RENAME TO creem_orders;
ALTER TABLE headshot_packs_expanded RENAME TO headshot_packs;
ALTER TABLE creem_events_expanded RENAME TO creem_events;
CREATE INDEX creem_orders_user_created ON creem_orders(user_id, created_at DESC);
CREATE INDEX headshot_packs_user ON headshot_packs(user_id, granted_at DESC);

CREATE TABLE creem_pro_entitlements (
  order_id TEXT PRIMARY KEY REFERENCES creem_orders(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  granted_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE INDEX creem_pro_entitlements_user ON creem_pro_entitlements(user_id, revoked_at);
