"use client";

import { useState } from "react";
import { Button } from "@loom-ai/ui";
import type { AnalyticsCopy } from "./contract";
import type { Consent } from "./browser";

type Props = {
  copy: AnalyticsCopy;
  privacyHref: string;
  consent: Consent;
  excluded: boolean;
  onSave: (consent: Exclude<Consent, null>, excluded: boolean) => void;
};

export function ConsentControls({ copy, privacyHref, consent, excluded, onSave }: Props) {
  const [open, setOpen] = useState(false);
  const [draftConsent, setDraftConsent] = useState(consent === "granted");
  const [draftExcluded, setDraftExcluded] = useState(excluded);

  if (!open && consent !== null) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="fixed bottom-4 left-4 z-40 shadow-sm"
        onClick={() => {
          setDraftConsent(consent === "granted");
          setDraftExcluded(excluded);
          setOpen(true);
        }}
      >
        {copy.settings}
      </Button>
    );
  }

  return (
    <section
      aria-labelledby="loom-analytics-title"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-2xl rounded-xl border bg-background p-5 text-foreground shadow-lg"
    >
      <h2 id="loom-analytics-title" className="text-base font-semibold">
        {open ? copy.settingsTitle : copy.title}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {open ? copy.settingsDescription : copy.description}{" "}
        <a href={privacyHref} className="underline underline-offset-4 hover:text-foreground">
          {copy.privacy}
        </a>
      </p>
      {open ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSave(draftConsent ? "granted" : "denied", draftExcluded);
            setOpen(false);
          }}
        >
          <label className="mt-4 flex cursor-pointer items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={draftConsent}
              onChange={(event) => setDraftConsent(event.target.checked)}
              className="size-4 cursor-pointer accent-primary"
            />
            {copy.consentLabel}
          </label>
          <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={draftExcluded}
              onChange={(event) => setDraftExcluded(event.target.checked)}
              className="mt-1 size-4 cursor-pointer accent-primary"
            />
            <span>
              <span className="block">{copy.excludeBrowser}</span>
              <span className="mt-1 block text-muted-foreground">
                {copy.excludeBrowserDescription}
              </span>
            </span>
          </label>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="submit">{copy.save}</Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {copy.cancel}
            </Button>
          </div>
        </form>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => onSave("denied", excluded)}>
            {copy.reject}
          </Button>
          <Button onClick={() => onSave("granted", excluded)}>{copy.accept}</Button>
          <Button variant="ghost" onClick={() => setOpen(true)}>
            {copy.settings}
          </Button>
        </div>
      )}
    </section>
  );
}
