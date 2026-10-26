import Image from "next/image";
import { useTranslations } from "@hotkey-tools/i18n";
import { Link } from "@hotkey-tools/i18n/navigation";
import { Button, GlassSurface } from "@hotkey-tools/ui";
import { ArrowRight, Braces, Globe2, Monitor, Sparkles } from "lucide-react";
import { IntelligenceWeave } from "./intelligence-weave";

export function HeroBanner() {
  const t = useTranslations("Web");
  return (
    <section
      data-loom-hero
      className="relative isolate -mx-6 overflow-hidden px-6 py-16 sm:py-20 lg:-mx-10 lg:px-10"
    >
      <IntelligenceWeave />
      <div className="relative z-10 mx-auto flex max-w-4xl flex-col items-center text-center">
        <GlassSurface className="mb-6 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs text-muted-foreground">
          <Sparkles className="size-3.5 text-link" aria-hidden="true" />
          {t("heroBadge")}
        </GlassSurface>
        <h1 className="text-4xl leading-tight font-medium tracking-tight sm:text-6xl lg:text-7xl">
          {t("heroTitle")}
          <br />
          <span className="loom-hero-accent">{t("heroAccent")}</span>
        </h1>
        <p className="mt-6 max-w-2xl text-base leading-8 text-muted-foreground sm:text-lg">
          {t("heroBody")}
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/workspace">
              {t("explore")}
              <ArrowRight />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/vision">
              {t("learnVision")}
              <ArrowRight />
            </Link>
          </Button>
        </div>
        <GlassSurface
          className="mt-10 inline-flex flex-wrap items-center justify-center gap-3 rounded-2xl px-4 py-3 sm:gap-5"
          role="img"
          aria-label={t("orbitLabel")}
        >
          <Image
            src="/loom-mark.svg"
            alt=""
            width={24}
            height={24}
            className="size-6 opacity-80 dark:invert"
            unoptimized
          />
          <span className="hidden h-5 border-l sm:block" aria-hidden="true" />
          {[
            { Icon: Monitor, label: t("desktop") },
            { Icon: Globe2, label: t("browser") },
            { Icon: Braces, label: t("editor") },
          ].map(({ Icon, label }) => (
            <span key={label} className="flex items-center gap-2 text-xs text-muted-foreground">
              <Icon className="size-4 text-link" aria-hidden="true" />
              {label}
            </span>
          ))}
        </GlassSurface>
        <p className="mt-5 font-mono text-xs tracking-widest text-muted-foreground">
          CONNECTING INTELLIGENCE. CRAFTING TOMORROW.
        </p>
      </div>
    </section>
  );
}
