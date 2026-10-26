import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  creemCheckoutInput,
  creemObjectId,
  requireCreemCheckout,
  requireCreemCheckoutUrl,
  requireCreemPaidOrder,
  requireCreemProduct,
  requireCreemTransaction,
} from "./creem-validation";
import {
  CreemTestDatabase,
  creemConfig,
  creemFixture,
  seedCreemOrder,
} from "../test/creem-fixtures";
import type { CreemCheckout, CreemOrderRow, CreemProduct, CreemTransaction } from "./creem-types";

describe("Creem provider data validation", () => {
  let db: CreemTestDatabase;
  let order: CreemOrderRow;
  beforeEach(() => {
    db = new CreemTestDatabase();
    order = seedCreemOrder(db);
  });
  afterEach(() => db.raw.close());

  it.each([
    ["foreign product", { id: "prod_other" }],
    ["archived", { status: "archived" }],
    ["different price", { price: 100 }],
    ["different currency", { currency: "EUR" }],
    ["recurring", { billingType: "recurring" }],
    ["exclusive tax", { taxMode: "exclusive" }],
    ["business VAT discount", { businessNetPricing: true }],
    ["live mode", { mode: "prod" }],
  ])("rejects %s configuration", (_name, changes) => {
    const { product } = creemFixture();
    expect(() =>
      requireCreemProduct({ ...product, ...changes } as CreemProduct, order.creem_product_id),
    ).toThrow();
  });

  it("accepts a fixed inclusive test product and keeps the return address independent of client input", () => {
    const { product } = creemFixture();
    requireCreemProduct(product, product.id);
    const input = creemCheckoutInput(order, creemConfig);
    expect(input.successUrl).toBe(
      `https://checkout.example/headshots?checkout=success&purchase_id=${order.id}`,
    );
    expect(input.metadata.user_id).toBe("alice");
    expect(input.units).toBe(1);
  });

  it.each([
    ["mode", { mode: "prod" }],
    ["missing id", { id: "" }],
    ["different request", { requestId: "other-request" }],
    ["different product", { product: "prod_other" }],
    ["multiple units", { units: 2 }],
    ["custom price", { customPrice: 999 }],
    ["return target", { successUrl: "https://evil.example/" }],
    ["missing metadata", { metadata: undefined }],
    ["different user", { metadata: { user_id: "bob" } }],
  ])("rejects checkout %s", (_name, changes) => {
    const { checkout } = creemFixture();
    expect(() =>
      requireCreemCheckout({ ...checkout, ...changes } as CreemCheckout, order, creemConfig),
    ).toThrow();
  });

  it("matches saved checkout ids, supports string product references and implicit one unit", () => {
    const { checkout } = creemFixture();
    requireCreemCheckout(checkout, order, creemConfig);
    order.checkout_id = "different-checkout";
    expect(() => requireCreemCheckout(checkout, order, creemConfig)).toThrow();
    order.checkout_id = checkout.id;
    checkout.product = order.creem_product_id;
    delete checkout.units;
    requireCreemCheckout(checkout, order, creemConfig);
  });

  it.each([
    undefined,
    "not-a-url",
    "http://www.creem.io/test/payment/a",
    "https://evil.example/test/payment/a",
    "https://www.creem.io.evil.example/test/payment/a",
    "https://user:password@www.creem.io/test/payment/a",
    "https://www.creem.io:444/test/payment/a",
    "https://www.creem.io/payment/a",
  ])("rejects unsafe or live checkout link %s", (checkoutUrl) => {
    const { checkout } = creemFixture();
    checkout.checkoutUrl = checkoutUrl;
    expect(() => requireCreemCheckoutUrl(checkout)).toThrow();
  });

  it("accepts only the provider's HTTPS test checkout link", () => {
    const { checkout } = creemFixture();
    expect(requireCreemCheckoutUrl(checkout)).toBe(checkout.checkoutUrl);
  });

  it.each([
    ["mode", { mode: "prod" }],
    ["unpaid", { status: "pending" }],
    ["subscription", { type: "recurring" }],
    ["other product", { product: "prod_other" }],
    ["price", { amount: 100 }],
    ["currency", { currency: "EUR" }],
    ["amount due", { amountDue: 100 }],
    ["amount paid", { amountPaid: 100 }],
    ["discount id", { discount: "dis_any" }],
    ["discount amount", { discountAmount: 50 }],
    ["missing id", { id: "" }],
    ["missing transaction", { transaction: null }],
  ])("rejects paid order %s", (_name, changes) => {
    const { checkout } = creemFixture();
    checkout.order = { ...checkout.order!, ...changes };
    expect(() => requireCreemPaidOrder(checkout, order)).toThrow();
  });

  it("requires a completed checkout and consistent saved provider order and transaction ids", () => {
    const { checkout } = creemFixture();
    checkout.status = "pending";
    expect(() => requireCreemPaidOrder(checkout, order)).toThrow();
    checkout.status = "completed";
    order.creem_order_id = "different-order";
    expect(() => requireCreemPaidOrder(checkout, order)).toThrow();
    order.creem_order_id = checkout.order!.id;
    order.transaction_id = "different-transaction";
    expect(() => requireCreemPaidOrder(checkout, order)).toThrow();
    order.transaction_id = checkout.order!.transaction!;
    delete checkout.order!.amountDue;
    delete checkout.order!.amountPaid;
    delete checkout.order!.discountAmount;
    requireCreemPaidOrder(checkout, order);
    delete checkout.order;
    expect(() => requireCreemPaidOrder(checkout, order)).toThrow();
  });

  it.each([
    ["mode", { mode: "prod" }],
    ["id", { id: "tran_other" }],
    ["order", { order: "ord_other" }],
    ["type", { type: "invoice" }],
    ["currency", { currency: "EUR" }],
    ["amount paid", { amountPaid: 100 }],
    ["noninteger refund", { refundedAmount: 1.5 }],
    ["negative refund", { refundedAmount: -1 }],
    ["excess refund", { refundedAmount: 1000 }],
    ["failed", { status: "failed" }],
  ])("rejects inconsistent transaction %s", (_name, changes) => {
    const { checkout, transaction } = creemFixture();
    expect(() =>
      requireCreemTransaction({ ...transaction, ...changes } as CreemTransaction, checkout, order),
    ).toThrow();
  });

  it("does not confuse the inclusive subtotal with the total paid or a partial refund with a full refund", () => {
    const { checkout, transaction } = creemFixture();
    transaction.amount = 832;
    transaction.amountPaid = 999;
    expect(requireCreemTransaction(transaction, checkout, order)).toEqual({ fullyRefunded: false });
    transaction.amount = 999;
    delete transaction.amountPaid;
    delete transaction.refundedAmount;
    expect(requireCreemTransaction(transaction, checkout, order)).toEqual({ fullyRefunded: false });
    transaction.status = "partialRefund";
    transaction.refundedAmount = 999;
    expect(() => requireCreemTransaction(transaction, checkout, order)).toThrow();
    transaction.status = "refunded";
    expect(requireCreemTransaction(transaction, checkout, order)).toEqual({ fullyRefunded: true });
  });

  it("extracts identifiers without coercing malformed object references", () => {
    expect(creemObjectId("tran_id")).toBe("tran_id");
    expect(creemObjectId({ id: "tran_id" })).toBe("tran_id");
    for (const value of [null, undefined, "", 42, {}, { id: 42 }, { id: "" }]) {
      expect(creemObjectId(value)).toBeNull();
    }
  });
});
