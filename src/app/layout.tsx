import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Sisters Lounge Exclusive — Monthly Salon Subscriptions",
    template: "%s · Sisters Lounge Exclusive",
  },
  description:
    "Salon subscriptions, appointment booking and hair-care management for Sisters Lounge, Ilorin.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#a72c66",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
