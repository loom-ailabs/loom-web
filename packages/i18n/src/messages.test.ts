import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
function keys(value: unknown, path = ""): string[] {
  return value && typeof value === "object"
    ? Object.entries(value).flatMap(([key, item]) => keys(item, `${path}.${key}`))
    : [path];
}
it("keeps the two complete message catalogs aligned for every consumer", () => {
  for (const name of ["common", "web", "sign-in", "access", "headshots", "seo"]) {
    const zh = JSON.parse(
      readFileSync(new URL(`../messages/zh/${name}.json`, import.meta.url), "utf8"),
    );
    const en = JSON.parse(
      readFileSync(new URL(`../messages/en/${name}.json`, import.meta.url), "utf8"),
    );
    expect(keys(zh).sort(), name).toEqual(keys(en).sort());
  }
});
