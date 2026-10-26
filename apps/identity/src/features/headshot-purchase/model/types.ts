/** Browser-safe purchase records. Payment providers remain server-side. */
export type HeadshotProduct = {
  name: string;
  amount: number;
  currency: string;
  mode: "test";
  photoCount: number;
  redoCount: number;
};

export type HeadshotOrder = {
  id: string;
  status: "pending" | "paid" | "refunded" | "expired";
  amount: number;
  currency: string;
  createdAt: number;
  updatedAt: number;
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

export type HeadshotAccount = {
  product: HeadshotProduct;
  user: { id: string; name?: string; email?: string } | null;
  orders: HeadshotOrder[];
  packs: HeadshotPack[];
};

export type HeadshotCheckout = {
  orderId: string;
  status: HeadshotOrder["status"];
  checkoutUrl?: string;
};
