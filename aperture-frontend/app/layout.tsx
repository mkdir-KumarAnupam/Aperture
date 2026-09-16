import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Apperture — Explore what India is talking about",
  description: "Real-time social listening and trend intelligence."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;600;700&display=swap" />
      </head>
      <body className="relative flex flex-col min-h-screen text-[#202124]">
        {children}
      </body>
    </html>
  );
}
