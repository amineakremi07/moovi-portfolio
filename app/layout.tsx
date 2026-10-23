import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Splash } from "@/components/brand/splash";
import { SPLASH_SKIP_SCRIPT } from "@/lib/splash";
import { ConsentBanner } from "@/components/consent/consent-banner";
import { PostHogProvider } from "@/components/providers/posthog-provider";
import { Toaster } from "@/components/ui/sonner";
import { Analytics } from "@vercel/analytics/next";
import { resolveAppUrl } from "@/lib/app-url";
import { BRAND_DESCRIPTION, BRAND_LOCALE, BRAND_NAME, BRAND_TITLE } from "@/lib/brand";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// No `alternates.canonical` here: it would be inherited by every page that sets none and point them all
// at the home page. Indexable pages set their own (`/`, `/courts/<id>`, `/espace-club`, legal pages).
export const metadata: Metadata = {
  metadataBase: new URL(resolveAppUrl()),
  title: { default: BRAND_TITLE, template: `%s | ${BRAND_NAME}` },
  description: BRAND_DESCRIPTION,
  applicationName: BRAND_NAME,
  openGraph: {
    type: "website",
    siteName: BRAND_NAME,
    locale: BRAND_LOCALE,
    title: BRAND_TITLE,
    description: BRAND_DESCRIPTION,
  },
  twitter: { card: "summary_large_image", title: BRAND_TITLE, description: BRAND_DESCRIPTION },
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: { capable: true, title: BRAND_NAME, statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1d3023",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Skip the splash for the rest of the session (runs before first paint). */}
        <script dangerouslySetInnerHTML={{ __html: SPLASH_SKIP_SCRIPT }} />
        <noscript>
          <style>{"#sg-splash{display:none}"}</style>
        </noscript>
      </head>
      <body className="min-h-full flex flex-col">
        <Splash />
        <PostHogProvider>{children}</PostHogProvider>
        <Toaster position="top-center" />
        <ConsentBanner />
        <Analytics />
      </body>
    </html>
  );
}
