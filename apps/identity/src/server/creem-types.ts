export const HEADSHOT_PRODUCT_KEY = "professional_headshots";
export const HEADSHOT_PRICE = 999;
export const HEADSHOT_PHOTO_COUNT = 4;
export const HEADSHOT_REDO_COUNT = 1;
export const LOOM_PRO_PRODUCT_KEY = "loom_pro";
export const LOOM_PRO_PRICE = 100;
export const CREEM_APPLICATION_KEY = "loom-identity";
export type CreemProductKey = typeof HEADSHOT_PRODUCT_KEY | typeof LOOM_PRO_PRODUCT_KEY;

export type CreemBillingConfig = {
  mode: "test";
  appUrl: string;
  productId: string;
  proProductId?: string;
  apiKey: string;
  webhookSecret: string;
};

export type CreemOrderRow = {
  id: string;
  user_id: string;
  request_id: string;
  product_key: CreemProductKey;
  creem_product_id: string;
  amount: number;
  currency: string;
  mode: "test";
  locale: "en" | "zh";
  status: "pending" | "paid" | "refunded" | "expired";
  checkout_state: "new" | "creating" | "ready" | "uncertain";
  checkout_id: string | null;
  checkout_url: string | null;
  creem_order_id: string | null;
  transaction_id: string | null;
  created_at: number;
  updated_at: number;
  paid_at: number | null;
  refunded_at: number | null;
};

export type CreemProduct = {
  id: string;
  mode: string;
  status: string;
  price: number;
  currency: string;
  billingType: string;
  taxMode: string;
  businessNetPricing?: boolean;
};

export type CreemCheckout = {
  id: string;
  mode: string;
  status: string;
  requestId?: string;
  product: string | CreemProduct;
  units?: number;
  customPrice?: number;
  order?: {
    id: string;
    mode: string;
    product: string;
    transaction?: string | null;
    amount: number;
    amountPaid?: number;
    amountDue?: number;
    currency: string;
    status: string;
    type: string;
    discount?: string | null;
    discountAmount?: number;
  };
  checkoutUrl?: string;
  successUrl?: string | null;
  metadata?: Record<string, unknown>;
};

export type CreemTransaction = {
  id: string;
  mode: string;
  amount: number;
  amountPaid?: number | null;
  currency: string;
  type: string;
  status: string;
  refundedAmount?: number | null;
  order?: string | null;
};

export type CreemCheckoutInput = {
  productId: string;
  requestId: string;
  units: number;
  successUrl: string;
  metadata: Record<string, string>;
};

export type CreemGateway = {
  getProduct(id: string): Promise<CreemProduct>;
  createCheckout(input: CreemCheckoutInput): Promise<CreemCheckout>;
  getCheckout(id: string): Promise<CreemCheckout>;
  getTransaction(id: string): Promise<CreemTransaction>;
};

export type CreemWebhookEvent = {
  id: string;
  eventType: string;
  object: Record<string, unknown>;
};

export type HeadshotPack = {
  id: string;
  orderId: string;
  photoCount: number;
  redoCount: number;
  grantedAt: number;
  revokedAt: number | null;
  status: "active" | "revoked";
};

export type HeadshotOrder = {
  id: string;
  productKey: CreemProductKey;
  status: CreemOrderRow["status"];
  amount: number;
  currency: "usd";
  mode: "test";
  createdAt: number;
  updatedAt: number;
  paidAt: number | null;
  refundedAt: number | null;
};
