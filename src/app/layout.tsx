import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Misal Hub OS", template: "%s · Misal Hub OS" },
  description: "Restaurant POS, kitchen display, inventory, CRM and franchise management for Misal Hub.",
  manifest: "/manifest.webmanifest",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Misal Hub OS", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#f45d0a", width: "device-width", initialScale: 1 };

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
