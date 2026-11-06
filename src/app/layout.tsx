// src/app/layout.tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Suspense } from "react";
import { DashboardSessionGuard } from "@/components/DashboardSessionGuard";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import {AppearanceSync} from '@/components/AppearanceSync';
import {DashboardLiveUpdates} from '@/components/DashboardLiveUpdates';
import {cookies} from 'next/headers';
import {DASHBOARD_SESSION_COOKIE,readDashboardSession,dashboardSessionExpiresAt} from '@/lib/dashboardSession';

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

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const lease=readDashboardSession((await cookies()).get(DASHBOARD_SESSION_COOKIE)?.value);
  const initialSession=lease?{startedAt:lease.startedAt,expiresAt:dashboardSessionExpiresAt(lease)}:null;
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{__html:THEME_INIT_SCRIPT}} /></head>
      <body className="min-h-screen bg-bg font-sans text-ink antialiased">
        <AppearanceSync/>
        <Suspense fallback={null}><DashboardSessionGuard initialSession={initialSession}/></Suspense>
        <Suspense fallback={null}><DashboardLiveUpdates/></Suspense>
        {children}
      </body>
    </html>
  );
}
