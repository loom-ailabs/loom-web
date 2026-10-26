import { describe, expect, it } from "vitest";
import { getAnalyticsConfiguration } from "./server";

const measurementId = "G-ABC1234567";

describe("analytics deployment configuration", () => {
  it("only enables configured production applications", () => {
    expect(
      getAnalyticsConfiguration(
        { APP_URL: "https://www.loom-labs.ai", GA_MEASUREMENT_ID: measurementId },
        "web",
      ),
    ).toEqual({ measurementId, application: "web" });
    for (const host of ["login.loom-labs.ai", "checkout.loom-labs.ai"]) {
      expect(
        getAnalyticsConfiguration(
          { APP_URL: `https://${host}`, GA_MEASUREMENT_ID: measurementId },
          "identity",
        ),
      ).toEqual({ measurementId, application: "identity" });
    }
  });

  it("leaves analytics off without an ID and in local or preview deployments", () => {
    expect(getAnalyticsConfiguration({ APP_URL: "https://www.loom-labs.ai" }, "web")).toBeNull();
    for (const APP_URL of [
      undefined,
      "invalid",
      "http://localhost:3000",
      "https://loom-web.quan-8bc.workers.dev",
      "http://www.loom-labs.ai",
      "https://www.loom-labs.ai:8443",
      "https://www.loom-labs.ai.example.com",
      "https://login.loom-labs.ai",
      "https://user:password@www.loom-labs.ai",
    ]) {
      expect(
        getAnalyticsConfiguration({ APP_URL, GA_MEASUREMENT_ID: measurementId }, "web"),
      ).toBeNull();
    }
  });

  it("rejects invalid explicit IDs rather than placing them in a script URL", () => {
    for (const GA_MEASUREMENT_ID of ["", " ", " G-ABC1234567", "G-123", "G-ABC1234567&x=1"])
      expect(() =>
        getAnalyticsConfiguration(
          { APP_URL: "https://www.loom-labs.ai", GA_MEASUREMENT_ID },
          "web",
        ),
      ).toThrow("GA_MEASUREMENT_ID");
  });
});
