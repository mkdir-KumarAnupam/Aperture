import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
});

export const metadata: Metadata = {
  title: "TrendScope India — Social Media Trend Intelligence",
  description:
    "Understand what India is talking about. TrendScope analyzes social trends across X, Reddit, and Telegram with a focus on the Indian audience. Prototype · Simulated analytics.",
  keywords: "social media trends, India, trend intelligence, analytics, X, Reddit, Telegram",
  openGraph: {
    title: "TrendScope India — Social Media Trend Intelligence",
    description: "Understand what India is talking about across X, Reddit, and Telegram.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${playfair.variable}`}
      style={{ fontFamily: "var(--font-inter, Inter, system-ui, sans-serif)" }}
    >
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
