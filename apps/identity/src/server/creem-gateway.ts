import "server-only";
import { Creem } from "creem";
import type { CreemGateway } from "./creem-types";

export function createCreemClient(apiKey: string): Creem {
  return new Creem({
    apiKey,
    server: "test",
    timeoutMs: 15_000,
    retryConfig: { strategy: "none" },
  });
}

export function createCreemGateway(apiKey: string): CreemGateway {
  const client = createCreemClient(apiKey);
  return {
    getProduct: (id) => client.products.get(id),
    createCheckout: (input) => client.checkouts.create(input),
    getCheckout: (id) => client.checkouts.retrieve(id),
    getTransaction: (id) => client.transactions.getById(id),
  };
}
