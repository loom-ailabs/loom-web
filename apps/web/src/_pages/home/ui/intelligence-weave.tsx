"use client";

import { useIntelligenceWeave } from "../model/use-intelligence-weave";

export function IntelligenceWeave() {
  const { rootRef, canvasRef } = useIntelligenceWeave();
  return (
    <div
      ref={rootRef}
      className="loom-weave-field pointer-events-none absolute inset-0 overflow-hidden"
      data-loom-weave
      data-weave-state="fallback"
      data-weave-drawn="false"
      aria-hidden="true"
    >
      <svg
        className="loom-weave-fallback"
        viewBox="0 0 1200 600"
        fill="none"
        preserveAspectRatio="none"
        focusable="false"
      >
        <g stroke="currentColor" strokeOpacity=".2" strokeWidth=".6">
          <path d="M-80 36C260-70 510 460 1280 22M-80 52C260-54 510 476 1280 38M-80 68C260-38 510 492 1280 54" />
          <path d="M-80 530C300 120 780 740 1280 318M-80 546C300 136 780 756 1280 334M-80 562C300 152 780 772 1280 350" />
        </g>
        <g fill="currentColor" fillOpacity=".25" className="font-mono text-xs">
          <text x="50" y="67">
            010 01 110 10
          </text>
          <text x="1010" y="103">
            10 001 01
          </text>
          <text x="40" y="490">
            110 10 010
          </text>
          <text x="995" y="440">
            01 110 010
          </text>
        </g>
      </svg>
      <canvas ref={canvasRef} className="loom-weave-canvas" />
    </div>
  );
}
