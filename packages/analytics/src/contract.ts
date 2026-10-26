export type AnalyticsApplication = "web" | "identity";

export type AnalyticsConfiguration = {
  measurementId: string;
  application: AnalyticsApplication;
};

export type AnalyticsCopy = {
  title: string;
  description: string;
  accept: string;
  reject: string;
  settings: string;
  settingsTitle: string;
  settingsDescription: string;
  consentLabel: string;
  excludeBrowser: string;
  excludeBrowserDescription: string;
  save: string;
  cancel: string;
  privacy: string;
};

export const ANALYTICS_HOSTS: Record<AnalyticsApplication, readonly string[]> = {
  web: ["www.loom-labs.ai"],
  identity: ["login.loom-labs.ai", "checkout.loom-labs.ai"],
};

export const PUBLIC_PATHS: Record<AnalyticsApplication, readonly string[]> = {
  web: ["/", "/vision", "/workspace", "/pricing", "/privacy", "/terms"],
  identity: ["/", "/headshots"],
};
