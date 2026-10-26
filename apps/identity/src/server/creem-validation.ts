import "server-only";
import { ApiError } from "./http";
import {
  CREEM_APPLICATION_KEY,
  HEADSHOT_PRICE,
  LOOM_PRO_PRODUCT_KEY,
  type CreemBillingConfig,
  type CreemCheckout,
  type CreemCheckoutInput,
  type CreemOrderRow,
  type CreemProduct,
  type CreemTransaction,
} from "./creem-types";

export function invalidCreemPayment(status = 400): ApiError {
  return new ApiError(status, "payment_mismatch", "Creem 付款信息与订单不一致。");
}

export function requireCreemTestMode(mode: unknown, status = 400): void {
  if (mode !== "test") {
    throw new ApiError(status, "billing_mode_mismatch", "仅接受 Creem 测试环境数据。");
  }
}

export function creemObjectId(value: unknown): string | null {
  if (typeof value === "string" && value) return value;
  if (typeof value === "object" && value !== null && "id" in value) {
    return typeof value.id === "string" && value.id ? value.id : null;
  }
  return null;
}

export function requireCreemProduct(
  product: CreemProduct,
  productId: string,
  expectedAmount = HEADSHOT_PRICE,
): void {
  requireCreemTestMode(product.mode, 503);
  if (
    product.id !== productId ||
    product.status !== "active" ||
    product.price !== expectedAmount ||
    product.currency !== "USD" ||
    product.billingType !== "onetime" ||
    product.taxMode !== "inclusive" ||
    product.businessNetPricing === true
  ) {
    throw new ApiError(
      503,
      "invalid_price_configuration",
      "需要与配置金额一致的 USD 含税单次商品。",
    );
  }
}

export function creemCheckoutInput(
  order: CreemOrderRow,
  config: CreemBillingConfig,
): CreemCheckoutInput {
  const path =
    order.product_key === LOOM_PRO_PRODUCT_KEY
      ? order.locale === "zh"
        ? "/zh"
        : "/"
      : order.locale === "zh"
        ? "/zh/headshots"
        : "/headshots";
  const successUrl = new URL(path, config.appUrl);
  successUrl.searchParams.set("checkout", "success");
  successUrl.searchParams.set("purchase_id", order.id);
  return {
    productId: order.creem_product_id,
    requestId: order.id,
    units: 1,
    successUrl: successUrl.toString(),
    metadata: {
      app_key: CREEM_APPLICATION_KEY,
      order_id: order.id,
      user_id: order.user_id,
      product_key: order.product_key,
      mode: "test",
    },
  };
}

export function requireCreemCheckout(
  checkout: CreemCheckout,
  order: CreemOrderRow,
  config: CreemBillingConfig,
): void {
  requireCreemTestMode(checkout.mode);
  const expected = creemCheckoutInput(order, config);
  if (
    !checkout.id ||
    (order.checkout_id !== null && order.checkout_id !== checkout.id) ||
    (checkout.requestId !== undefined && checkout.requestId !== expected.requestId) ||
    creemObjectId(checkout.product) !== order.creem_product_id ||
    (checkout.units ?? 1) !== 1 ||
    checkout.customPrice !== undefined ||
    (checkout.successUrl != null && checkout.successUrl !== expected.successUrl) ||
    !Object.entries(expected.metadata).every(([key, value]) => checkout.metadata?.[key] === value)
  ) {
    throw invalidCreemPayment();
  }
  if (typeof checkout.product !== "string") {
    requireCreemProduct(checkout.product, order.creem_product_id, order.amount);
  }
}

export function requireCreemCheckoutUrl(checkout: CreemCheckout): string {
  let url: URL;
  try {
    url = new URL(checkout.checkoutUrl ?? "");
  } catch {
    throw invalidCreemPayment();
  }
  if (
    url.protocol !== "https:" ||
    !["www.creem.io", "creem.io"].includes(url.hostname) ||
    url.port ||
    url.username ||
    url.password ||
    !url.pathname.startsWith("/test/")
  ) {
    throw invalidCreemPayment();
  }
  return url.toString();
}

export function requireCreemPaidOrder(checkout: CreemCheckout, order: CreemOrderRow) {
  const paid = checkout.order;
  if (!paid) throw invalidCreemPayment();
  requireCreemTestMode(paid.mode);
  if (
    checkout.status !== "completed" ||
    paid.status !== "paid" ||
    paid.type !== "onetime" ||
    paid.product !== order.creem_product_id ||
    paid.amount !== order.amount ||
    paid.currency !== order.currency ||
    (paid.amountDue ?? paid.amount) !== order.amount ||
    (paid.amountPaid ?? paid.amount) !== order.amount ||
    paid.discount ||
    (paid.discountAmount ?? 0) !== 0 ||
    !paid.id ||
    !paid.transaction ||
    (order.creem_order_id !== null && order.creem_order_id !== paid.id) ||
    (order.transaction_id !== null && order.transaction_id !== paid.transaction)
  ) {
    throw invalidCreemPayment();
  }
  return paid;
}

export function requireCreemTransaction(
  transaction: CreemTransaction,
  checkout: CreemCheckout,
  order: CreemOrderRow,
): { fullyRefunded: boolean } {
  const paid = requireCreemPaidOrder(checkout, order);
  requireCreemTestMode(transaction.mode);
  const amountPaid = transaction.amountPaid ?? transaction.amount;
  const refunded = transaction.refundedAmount ?? 0;
  if (
    transaction.id !== paid.transaction ||
    transaction.order !== paid.id ||
    transaction.type !== "payment" ||
    transaction.currency !== order.currency ||
    amountPaid !== order.amount ||
    !Number.isSafeInteger(refunded) ||
    refunded < 0 ||
    refunded > amountPaid ||
    (transaction.status === "refunded" && refunded !== amountPaid) ||
    (transaction.status !== "refunded" && refunded === amountPaid) ||
    !["paid", "partialRefund", "refunded"].includes(transaction.status)
  ) {
    throw invalidCreemPayment();
  }
  return { fullyRefunded: transaction.status === "refunded" && refunded === amountPaid };
}
