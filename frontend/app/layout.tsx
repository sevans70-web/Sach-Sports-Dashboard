import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./theme.css";
import "./history-ui-fixes.css";
import "./portal-no-flash.css";
import {SiteHeader} from "@/components/site-header";
import {AdminAuthReturn} from "@/components/admin-auth-return";
import "./dashboard-shell.css";

export const metadata: Metadata = {
  title: "Sach Sports",
  applicationName: "Sach Sports",
  description: "Multi-sport game intelligence and player prop research",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Sach Sports",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/brand/sach-sports-crown-logo.png",
    apple: "/brand/sach-sports-crown-logo.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#050706",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AdminAuthReturn />
        <SiteHeader />
        <div className="ssRouteSurface">{children}</div>
      </body>
    </html>
  );
}
