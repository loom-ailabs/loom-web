import { describe, expect, it } from "vitest";
import { getLegalMessages, getMessagesForLocale } from "./server";

describe("server-only legal content loading", () => {
  it.each(["en", "zh"] as const)(
    "loads complete %s notices without serializing them into every client dictionary",
    async (locale) => {
      const legal = await getLegalMessages(locale);
      expect(legal.privacy.sections.map((section) => section.id)).toEqual(
        expect.arrayContaining(["sign_in", "cookies", "analytics", "choices"]),
      );
      const analytics = legal.privacy.sections.find((section) => section.id === "analytics");
      expect(analytics).toMatchObject({
        title: expect.any(String),
        paragraphs: expect.arrayContaining([expect.stringContaining("Google Analytics 4")]),
      });
      expect(legal.terms.sections).toHaveLength(6);
      expect(legal.privacy.lead).toContain("boylucky2012@gmail.com");
      const client = JSON.stringify(await getMessagesForLocale(locale));
      expect(client).not.toContain(legal.privacy.lead);
      expect(client).not.toContain(legal.terms.lead);
      expect(client).not.toContain(analytics!.paragraphs[0]);
    },
  );
});

describe("billing presentation messages", () => {
  it.each(["en", "zh"] as const)(
    "serializes only the active billing branch in %s",
    async (locale) => {
      const test = await getMessagesForLocale(locale);
      expect(Object.keys(test.Web.billing)).toEqual(["test"]);
      expect(Object.keys(test.Access.billing)).toEqual(["test"]);
      expect(JSON.stringify(test)).toMatch(/Test payment|测试支付|用于测试/);
      const live = await getMessagesForLocale(locale, "live");
      expect(Object.keys(live.Web.billing)).toEqual(["live"]);
      expect(Object.keys(live.Access.billing)).toEqual(["live"]);
      expect(JSON.stringify(live)).toContain("USD 1.00");
      expect(JSON.stringify(live)).not.toMatch(
        /Sandbox|Test payment|test payment|no real charge|不会真实扣款|用于测试|一次性测试付款/,
      );
    },
  );
});
