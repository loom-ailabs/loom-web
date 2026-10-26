import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { CreemTestDatabase, seedCreemOrder } from "../test/creem-fixtures";

const migration = readFileSync(
  new URL("../../migrations/0006_creem_pro.sql", import.meta.url),
  "utf8",
);
let db: CreemTestDatabase | undefined;
afterEach(() => db?.raw.close());

function populatedDatabase() {
  const database = new CreemTestDatabase("0005_creem_headshot_packs.sql");
  const order = seedCreemOrder(database);
  database.raw
    .prepare(
      "UPDATE creem_orders SET status = 'paid', checkout_id = 'ch_paid', creem_order_id = 'ord_paid', transaction_id = 'tran_paid', paid_at = 12",
    )
    .run();
  database.raw
    .prepare(
      "INSERT INTO headshot_packs(id,order_id,user_id,photo_count,redo_count,granted_at) VALUES (?,?,'alice',4,1,12)",
    )
    .run(order.id, order.id);
  database.raw
    .prepare(
      "INSERT INTO creem_events(id,type,order_id,mode,received_at,processed_at) VALUES ('evt_paid','checkout.completed',?,'test',12,12)",
    )
    .run(order.id);
  return database;
}

function insertPro(database: CreemTestDatabase, key = "loom_pro", amount = 100) {
  database.raw
    .prepare(`INSERT INTO creem_orders
    (id,user_id,request_id,product_key,creem_product_id,amount,currency,mode,locale,created_at,updated_at)
    VALUES ('pro-order','alice','pro-request',?,'prod_pro',?,'USD','test','en',20,20)`)
    .run(key, amount);
}

describe("Creem multi-product migration", () => {
  it("preserves paid headshot orders, packs, processed events and their foreign keys", () => {
    db = populatedDatabase();
    const before = {
      orders: db.raw.prepare("SELECT * FROM creem_orders").all(),
      packs: db.raw.prepare("SELECT * FROM headshot_packs").all(),
      events: db.raw.prepare("SELECT * FROM creem_events").all(),
    };
    db.raw.exec("BEGIN IMMEDIATE");
    db.raw.exec(migration);
    db.raw.exec("COMMIT");
    expect(db.raw.prepare("SELECT * FROM creem_orders").all()).toEqual(before.orders);
    expect(db.raw.prepare("SELECT * FROM headshot_packs").all()).toEqual(before.packs);
    expect(db.raw.prepare("SELECT * FROM creem_events").all()).toEqual(before.events);
    expect(db.raw.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    insertPro(db);
    db.raw
      .prepare(
        "INSERT INTO creem_pro_entitlements(order_id,user_id,granted_at) VALUES ('pro-order','alice',20)",
      )
      .run();
    expect(db.raw.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(() =>
      db!.raw
        .prepare(
          "INSERT INTO creem_pro_entitlements(order_id,user_id,granted_at) VALUES ('missing','alice',20)",
        )
        .run(),
    ).toThrow();
  });

  it.each([
    ["loom_pro", 999],
    ["professional_headshots", 100],
    ["other_product", 100],
  ])("rejects unconfigured SKU/amount pair %s %s", (key, amount) => {
    db = populatedDatabase();
    db.raw.exec("BEGIN IMMEDIATE");
    db.raw.exec(migration);
    db.raw.exec("COMMIT");
    expect(() => insertPro(db!, key as string, amount as number)).toThrow();
  });

  it("rolls back the entire rebuild if a statement fails after the old parent was dropped", () => {
    db = populatedDatabase();
    const before = db.raw.prepare("SELECT * FROM creem_orders").all();
    db.raw.exec("BEGIN IMMEDIATE");
    try {
      db.raw.exec(migration.split("ALTER TABLE creem_orders_expanded RENAME TO creem_orders;")[0]!);
      db.raw.exec("SELECT * FROM migration_fault_injection");
      throw new Error("Expected SQL failure");
    } catch (error) {
      db.raw.exec("ROLLBACK");
      expect(String(error)).toContain("migration_fault_injection");
    }
    expect(db.raw.prepare("SELECT * FROM creem_orders").all()).toEqual(before);
    expect(db.raw.prepare("SELECT count(*) AS n FROM headshot_packs").get()?.n).toBe(1);
    expect(db.raw.prepare("SELECT count(*) AS n FROM creem_events").get()?.n).toBe(1);
    expect(db.raw.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(() => insertPro(db!)).toThrow();
  });
});
