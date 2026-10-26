import Image from "next/image";
import { getLegalMessages } from "@hotkey-tools/i18n/server";
import { localizePath, type Locale } from "@hotkey-tools/i18n/routing";
import { LegalControls } from "./legal-controls";

export async function LegalPage({ kind, locale }: { kind: "privacy" | "terms"; locale: Locale }) {
  const messages = await getLegalMessages(locale);
  const content = messages[kind];
  const labels = messages.common;
  return (
    <div className="min-h-svh bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-6 px-6 py-5">
          <a
            href={localizePath("/", locale)}
            aria-label={labels.home}
            className="inline-flex items-center gap-2.5 rounded-md text-lg font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Image
              src="/loom-mark.svg"
              width={36}
              height={36}
              alt=""
              className="size-9 opacity-85 dark:invert"
              unoptimized
            />
            Loom AI
          </a>
          <LegalControls />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-12 sm:py-20">
        <article aria-labelledby="legal-title">
          <h1 id="legal-title" className="text-3xl font-medium tracking-tight sm:text-4xl">
            {content.title}
          </h1>
          <p className="mt-4 text-xs text-muted-foreground">
            {labels.updated}: <time dateTime="2026-10-26">{labels.date}</time>
          </p>
          <p className="mt-6 text-base leading-8 text-muted-foreground">{content.lead}</p>
          <div className="mt-10 space-y-10">
            {content.sections.map((section) => (
              <section key={section.id} aria-labelledby={`legal-${section.id}`}>
                <h2 id={`legal-${section.id}`} className="mb-4 text-xl font-medium tracking-tight">
                  {section.title}
                </h2>
                <div className="space-y-4 text-sm leading-8 text-muted-foreground">
                  {section.paragraphs.map((paragraph, index) => (
                    <p key={`${section.id}-${index}`}>{paragraph}</p>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </article>
      </main>
      <footer className="border-t">
        <nav
          aria-label={labels.navigation}
          className="mx-auto flex max-w-4xl flex-wrap items-center gap-6 px-6 py-7 text-sm text-muted-foreground"
        >
          <a
            href={localizePath("/", locale)}
            className="rounded-md hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            {labels.home}
          </a>
          <a
            href={localizePath("/privacy", locale)}
            className="rounded-md hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            {labels.privacy}
          </a>
          <a
            href={localizePath("/terms", locale)}
            className="rounded-md hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            {labels.terms}
          </a>
          <a
            href="mailto:boylucky2012@gmail.com"
            className="rounded-md hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            {labels.contact}
          </a>
        </nav>
      </footer>
    </div>
  );
}
