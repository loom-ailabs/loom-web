"use client";

import { useEffect, useState } from "react";
import type { CarouselApi } from "@loom-ai/ui";

export function useShowcase() {
  const [api, setApi] = useState<CarouselApi>();
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const desktop = window.matchMedia("(min-width: 1024px)");
    const update = () => {
      setReducedMotion(motion.matches);
      setVisible(desktop.matches && !document.hidden);
    };
    update();
    motion.addEventListener("change", update);
    desktop.addEventListener("change", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      motion.removeEventListener("change", update);
      desktop.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  useEffect(() => {
    if (!api) return;
    const select = () => setActive(api.selectedScrollSnap());
    const dragStart = () => setDragging(true);
    const dragEnd = () => setDragging(false);
    select();
    api
      .on("select", select)
      .on("reInit", select)
      .on("pointerDown", dragStart)
      .on("pointerUp", dragEnd);
    return () => {
      api
        .off("select", select)
        .off("reInit", select)
        .off("pointerDown", dragStart)
        .off("pointerUp", dragEnd);
    };
  }, [api]);
  const rotating = playing && !hovered && !dragging && !reducedMotion && visible;
  useEffect(() => {
    if (!api || !rotating) return;
    const timer = window.setInterval(() => api.scrollNext(), 7_000);
    return () => window.clearInterval(timer);
  }, [api, rotating, active]);
  return {
    api,
    setApi,
    active,
    rotating,
    reducedMotion,
    playing,
    pause: () => setPlaying(false),
    hover: setHovered,
    toggle: () => setPlaying((current) => !current),
    select: (index: number) => {
      api?.scrollTo(index, reducedMotion);
    },
  };
}
