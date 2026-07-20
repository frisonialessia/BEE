import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BEE — Sales Force Intelligence",
  description:
    "A living system that detects and executes sales opportunities from real-time market signals.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
