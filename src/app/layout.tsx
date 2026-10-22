import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Misal Hub OS", template: "%s · Misal Hub OS" },
  description: "Restaurant POS, kitchen display, inventory, CRM and franchise management for Misal Hub.",
  manifest: "/manifest.webmanifest",
  robots: { index: false, follow: false },
  icons: { icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }, { url: "/icon.svg", type: "image/svg+xml" }], apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }] },
  appleWebApp: { capable: true, title: "Misal Hub OS", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#f45d0a", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
