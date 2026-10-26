import { NextIntlClientProvider } from "@loom-ai/i18n";
import type { ReactNode } from "react";
import Web from "../../../../packages/i18n/messages/zh/web.json";
export function IntlWrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="zh" messages={{ Web }} timeZone="Asia/Shanghai">
      {children}
    </NextIntlClientProvider>
  );
}
