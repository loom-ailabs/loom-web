import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

const migrations = new URL("../../../apps/identity/migrations/", import.meta.url);
const databases: DatabaseSync[] = [];
afterEach(() => databases.splice(0).forEach((db) => db.close()));

function migrate(db: DatabaseSync, name: string) {
  db.exec(readFileSync(new URL(name, migrations), "utf8"));
}

function database(includePayloadVersion = true) {
  const db = new DatabaseSync(":memory:");
  databases.push(db);
  for (const name of readdirSync(migrations)
    .filter((file) => file.endsWith(".sql"))
    .sort()) {
    if (includePayloadVersion || name < "0004_checkout_payload_version.sql") migrate(db, name);
  }
  db.exec(
    "INSERT INTO users (id, issuer, subject, created_at) VALUES ('user', 'fixture', 'user', 1)",
  );
  return db;
}

function insertOrder(db: DatabaseSync, id: string) {
  db.prepare(`INSERT INTO orders
    (id, user_id, request_id, product_key, feature_key, stripe_price_id, amount, currency,
     created_at, updated_at) VALUES (?, 'user', ?, 'hotkey-tools', 'premium-demo', 'price_fixture', 100, 'usd', 1, 1)`).run(
    id,
    id,
  );
}

describe("Checkout payload version migration", () => {
  it("preserves historical pending and paid orders, including lost-response attempts, as version 1", () => {
    const db = database(false);
    insertOrder(db, "lost-response");
    insertOrder(db, "paid");
    db.exec(`UPDATE orders SET status='paid', checkout_session_id='cs_fixture', paid_at=2 WHERE id='paid';
      INSERT INTO stripe_events (id, type, order_id, received_at, processed_at)
        VALUES ('event', 'checkout.session.completed', 'paid', 1, 2)`);
    const before = db.prepare("SELECT * FROM orders ORDER BY id").all();
    const eventBefore = db.prepare("SELECT * FROM stripe_events").get();
    migrate(db, "0004_checkout_payload_version.sql");
    expect(db.prepare("SELECT * FROM orders ORDER BY id").all()).toEqual(
      before.map((order) => ({ ...order, checkout_payload_version: 1 })),
    );
    expect(db.prepare("SELECT * FROM stripe_events").get()).toEqual(eventBefore);
    expect(
      db
        .prepare("SELECT checkout_session_id, checkout_url FROM orders WHERE id='lost-response'")
        .get(),
    ).toMatchObject({ checkout_session_id: null, checkout_url: null });
  });

  it("loads all migrations in order and supports explicit version 2 for new orders in either mode", () => {
    const db = database();
    insertOrder(db, "default");
    expect(
      db.prepare("SELECT checkout_payload_version FROM orders WHERE id='default'").get(),
    ).toMatchObject({ checkout_payload_version: 1 });
    for (const mode of ["test", "live"]) {
      db.prepare(`INSERT INTO orders
        (id, user_id, request_id, product_key, feature_key, stripe_price_id, amount, currency,
         created_at, updated_at, stripe_mode, checkout_payload_version)
         VALUES (?, 'user', ?, 'hotkey-tools', 'premium-demo', 'price_fixture', 100, 'usd', 1, 1, ?, 2)`).run(
        mode,
        mode,
        mode,
      );
      expect(
        db.prepare("SELECT stripe_mode, checkout_payload_version FROM orders WHERE id=?").get(mode),
      ).toMatchObject({ stripe_mode: mode, checkout_payload_version: 2 });
    }
  });

  it.each([0, 3, -1, 1.5, null, "unknown"] satisfies SQLInputValue[])(
    "rejects an unsupported stored payload version %j",
    (version) => {
      const db = database();
      insertOrder(db, "order");
      expect(() =>
        db.prepare("UPDATE orders SET checkout_payload_version=? WHERE id='order'").run(version),
      ).toThrow();
      expect(
        db.prepare("SELECT checkout_payload_version FROM orders WHERE id='order'").get(),
      ).toMatchObject({ checkout_payload_version: 1 });
    },
  );
});
