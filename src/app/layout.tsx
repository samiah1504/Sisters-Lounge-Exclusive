import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Sisters Lounge — Nigeria's First Members-Only Natural Hair Club",
    template: "%s · Sisters Lounge Exclusive",
  },
  description:
    "Healthy natural hair through consistent professional care. Members-only salons across Nigeria — no walk-ins, no overcrowding.",
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
