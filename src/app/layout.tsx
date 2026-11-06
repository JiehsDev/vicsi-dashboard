// src/app/layout.tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Suspense } from "react";
import { DashboardSessionGuard } from "@/components/DashboardSessionGuard";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  icons: {icon: [{url:'/brand/favicon.svg?v=5.5',type:'image/svg+xml',sizes:'any'}]},
  title: "ViCSI · Learning Analytics",
  description:
    "Student learning records and instructor assessment analytics for ViCSI.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{__html:THEME_INIT_SCRIPT}} /></head>
      <body className="min-h-screen bg-bg font-sans text-ink antialiased">
        <Suspense fallback={null}><DashboardSessionGuard /></Suspense>
        {children}
      </body>
    </html>
  );
}
