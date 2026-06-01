import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import ThemeControls from "@/components/ThemeControls";
import { NO_FLASH_SCRIPT } from "@/lib/theme";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Katari",
  description: "A private mood-board for reviewing ideas together.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_SCRIPT }} />
      </head>
      <body className="min-h-full">
        {children}
        <ThemeControls />
      </body>
    </html>
  );
}
