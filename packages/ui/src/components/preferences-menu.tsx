"use client";

import { Languages, Palette } from "lucide-react";
import { useAppearance } from "./appearance-provider";
import { Button } from "./button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./dropdown-menu";

type PreferencesProps = {
  locale: string;
  onLocaleChange: (locale: "zh" | "en") => void;
  labels: {
    settings: string;
    theme: string;
    light: string;
    dark: string;
    system: string;
    language: string;
  };
};
export function PreferencesMenuItems({ locale, onLocaleChange, labels }: PreferencesProps) {
  const { theme, setAppearance } = useAppearance();
  return (
    <>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <Palette aria-hidden="true" />
          {labels.theme}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent sideOffset={4}>
          <DropdownMenuRadioGroup value={theme} onValueChange={setAppearance}>
            {(["light", "dark", "system"] as const).map((value) => (
              <DropdownMenuRadioItem key={value} value={value}>
                {labels[value]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <Languages aria-hidden="true" />
          {labels.language}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent sideOffset={4}>
          <DropdownMenuRadioGroup
            value={locale}
            onValueChange={(value) => {
              if (value === "zh" || value === "en") onLocaleChange(value);
            }}
          >
            <DropdownMenuRadioItem value="en">English</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="zh">简体中文</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    </>
  );
}
export function PreferencesMenu(props: PreferencesProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={props.labels.settings}>
          <span aria-hidden="true">◐</span>
          <span className="hidden sm:inline">{props.locale === "en" ? "EN" : "中文"}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{props.labels.settings}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <PreferencesMenuItems {...props} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
