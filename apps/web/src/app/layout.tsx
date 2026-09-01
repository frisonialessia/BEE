import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";

import { AppProviders } from "@/providers/app-providers";

export const metadata: Metadata = {
  title: "BEE — Sales Force Intelligence",
  description:
    "A living system that detects and executes sales opportunities from real-time market signals.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Resolved per-request by src/i18n/request.ts (cookie → Accept-Language →
  // Spanish default — see that file's docstring). `lang` used to be
  // hardcoded "es"; it now reflects whatever the visitor actually sees, as
  // both correctness (screen readers, browser translate prompts) and a
  // basic i18n requirement expect.
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning className="h-full antialiased">
      <body className="min-h-full font-sans">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <AppProviders>{children}</AppProviders>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
