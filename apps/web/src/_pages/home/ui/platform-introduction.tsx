import { useLocale, useTranslations } from "@loom-ai/i18n";
import { getSeoMessages } from "@loom-ai/i18n/seo";

export function PlatformIntroduction() {
  const t = useTranslations("Web");
  const locale = useLocale();
  const { faq } = getSeoMessages(locale === "zh" ? "zh" : "en");

  return (
    <section className="border-b py-16 sm:py-20">
      <h2 className="text-2xl font-medium tracking-tight sm:text-3xl">{t("platformTitle")}</h2>
      <p className="mt-5 max-w-3xl text-base leading-8 text-muted-foreground">
        {t("platformBody")}
      </p>
      <h3 className="mt-12 text-xl font-medium tracking-tight">{faq.title}</h3>
      <dl className="mt-6 grid gap-8 md:grid-cols-2">
        {faq.items.map(({ question, answer }) => (
          <div key={question}>
            <dt className="font-medium">{question}</dt>
            <dd className="mt-3 text-sm leading-7 text-muted-foreground">{answer}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
