"use client";

import { useTranslations } from "@loom-ai/i18n";
import { Button, Carousel, CarouselContent, CarouselItem, GlassSurface, cn } from "@loom-ai/ui";
import { Layers3, ShieldCheck, Sparkles } from "lucide-react";
import { useShowcase } from "../model/use-showcase";
import { LoginArt } from "./login-art";

const slides = ["connect", "continuity", "access"] as const;

export function LoginShowcase() {
  const t = useTranslations("SignIn.carousel");
  const show = useShowcase();
  return (
    <aside className="hidden min-w-0 p-2 pl-0 lg:flex" aria-label={t("label")}>
      <GlassSurface className="flex flex-1 flex-col overflow-hidden">
        <div className="flex flex-1 items-center py-12">
          <Carousel
            opts={{ loop: true, duration: show.reducedMotion ? 0 : 30 }}
            setApi={show.setApi}
            aria-label={t("label")}
            aria-roledescription={t("role")}
            className={cn("w-full", !show.rotating && "loom-login-paused")}
            onFocusCapture={show.pause}
            onMouseEnter={() => show.hover(true)}
            onMouseLeave={() => show.hover(false)}
          >
            {!show.reducedMotion && (
              <Button
                variant="ghost"
                size="sm"
                className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:right-5 focus-visible:top-0 focus-visible:z-10 focus-visible:px-3 focus-visible:py-1"
                onPointerDown={(event) => event.preventDefault()}
                onClick={show.toggle}
              >
                {show.playing ? t("pause") : t("play")}
              </Button>
            )}
            <CarouselContent aria-live={show.rotating ? "off" : "polite"} aria-atomic="false">
              {slides.map((slide, index) => (
                <CarouselItem
                  key={slide}
                  aria-roledescription={t("slideRole")}
                  aria-label={t("position", { index: index + 1, total: slides.length })}
                  aria-hidden={show.active !== index}
                >
                  <div className="px-8 text-center xl:px-14">
                    <div className="mx-auto mb-7 max-w-sm">
                      <LoginArt kind={slide} />
                    </div>
                    <p className="mb-4 flex items-center justify-center gap-2 text-xs font-medium tracking-wide text-link">
                      <Layers3 className="size-4" aria-hidden="true" />
                      {t(`${slide}.eyebrow`)}
                    </p>
                    <h2 className="text-3xl font-medium leading-tight tracking-tight xl:text-4xl">
                      {t(`${slide}.title`)}
                    </h2>
                    <p className="mx-auto mt-5 max-w-md text-sm leading-7 text-muted-foreground">
                      {t(`${slide}.description`)}
                    </p>
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
            <div className="mt-8 flex justify-center">
              <div className="flex items-center gap-2" role="group" aria-label={t("choose")}>
                {slides.map((slide, index) => (
                  <button
                    type="button"
                    key={slide}
                    aria-label={t(`${slide}.title`)}
                    aria-disabled={show.active === index}
                    className="group flex h-8 w-8 items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => {
                      if (show.active !== index) show.select(index);
                    }}
                  >
                    <span
                      className={cn(
                        "h-0.5 w-6 transition-colors motion-reduce:transition-none",
                        show.active === index
                          ? "bg-foreground"
                          : "bg-muted-foreground/30 group-hover:bg-muted-foreground",
                      )}
                    />
                  </button>
                ))}
              </div>
            </div>
          </Carousel>
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-border/50 px-6 py-5 text-xs text-muted-foreground xl:px-8">
          <span className="flex items-center gap-2">
            <Layers3 className="size-3.5" aria-hidden="true" />
            {t("benefitAccount")}
          </span>
          <span className="flex items-center gap-2">
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            {t("benefitSecurity")}
          </span>
          <span className="flex items-center gap-2">
            <Sparkles className="size-3.5" aria-hidden="true" />
            {t("benefitControl")}
          </span>
        </footer>
      </GlassSurface>
    </aside>
  );
}
