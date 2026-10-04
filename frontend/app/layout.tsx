import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./theme.css";
import "./history-ui-fixes.css";
import "./portal-no-flash.css";
import { PredictionPerformancePortal } from "@/components/prediction-performance-portal";
import { PlayerRankingsPortal } from "@/components/player-rankings-portal";
import { RoutePreloader } from "@/components/route-preloader";

export const metadata: Metadata = {
  title: "Sach Sports",
  description: "Multi-sport game intelligence and player prop research",
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
        <RoutePreloader />
        {children}
        <PredictionPerformancePortal />
        <PlayerRankingsPortal />
      </body>
    </html>
  );
}
