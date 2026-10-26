// @vitest-environment happy-dom
import { runInNewContext } from "node:vm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AppearanceProvider, type Appearance } from "@loom-ai/ui";

function serverMarkup(initialTheme?: Appearance) {
  const markup = renderToStaticMarkup(
    createElement(AppearanceProvider, {
      initialTheme,
      children: createElement("main", null, "Readable content"),
    }),
  );
  const container = document.createElement("div");
  container.innerHTML = markup;
  const bootstrap = container.querySelector<HTMLScriptElement>("script[data-loom-theme-bootstrap]");
  expect(bootstrap).not.toBeNull();
  return { markup, container, bootstrap: bootstrap! };
}

function execute(source: string, systemDark = false) {
  const classes = new Set(["existing-page-class", "light", "dark"]);
  const element = {
    classList: {
      add: (value: string) => classes.add(value),
      remove: (...values: string[]) => values.forEach((value) => classes.delete(value)),
    },
    style: { colorScheme: "" },
  };
  const matchMedia = vi.fn(() => ({ matches: systemDark }));
  const readStorage = vi.fn(() => {
    throw new Error("The bootstrap must not read origin-local preferences.");
  });
  runInNewContext(source, {
    document: { documentElement: element },
    window: { matchMedia },
    get localStorage() {
      return readStorage();
    },
  });
  expect(readStorage).not.toHaveBeenCalled();
  expect(classes.has("existing-page-class")).toBe(true);
  return { classes, element, matchMedia };
}

describe("appearance bootstrap at the public provider boundary", () => {
  it.each(["light", "dark"] as const)(
    "applies explicit %s before content without bundler helpers",
    (theme) => {
      const { markup, bootstrap } = serverMarkup(theme);
      expect(markup.indexOf("data-loom-theme-bootstrap")).toBeLessThan(markup.indexOf("<main>"));
      expect(bootstrap.textContent).not.toContain("__name");
      const result = execute(bootstrap.textContent!, theme !== "dark");
      expect([...result.classes].sort()).toEqual(["existing-page-class", theme].sort());
      expect(result.element.style.colorScheme).toBe(theme);
      expect(result.matchMedia).not.toHaveBeenCalled();
    },
  );

  it.each([true, false])("resolves system preference synchronously (dark=%s)", (systemDark) => {
    const { bootstrap } = serverMarkup("system");
    const { classes, element, matchMedia } = execute(bootstrap.textContent!, systemDark);
    expect(classes.has(systemDark ? "dark" : "light")).toBe(true);
    expect(classes.has("system")).toBe(false);
    expect(element.style.colorScheme).toBe(systemDark ? "dark" : "light");
    expect(matchMedia).toHaveBeenCalledWith("(prefers-color-scheme: dark)");
  });

  it("defaults to dark and keeps the third-party serialized script inert", () => {
    const { container, bootstrap } = serverMarkup();
    const scripts = [...container.querySelectorAll<HTMLScriptElement>("script")];
    expect(scripts.filter((script) => script.type !== "text/plain")).toEqual([bootstrap]);
    expect(scripts.some((script) => script.type === "text/plain")).toBe(true);
    expect(execute(bootstrap.textContent!).classes.has("dark")).toBe(true);
    expect(container.querySelector("main")?.textContent).toBe("Readable content");
  });

  it("rejects an invalid initial value before either script receives it", () => {
    const malicious = '</script><script>alert("invalid-theme")</script>';
    const { markup, bootstrap } = serverMarkup(malicious as Appearance);
    expect(markup).not.toContain("invalid-theme");
    expect(execute(bootstrap.textContent!).classes.has("dark")).toBe(true);
  });
});
