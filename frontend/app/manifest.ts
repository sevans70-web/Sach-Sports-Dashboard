import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Sach Sports Dashboard",
    short_name: "Sach Sports",
    description: "Private multi-sport game intelligence and player prop research",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#050706",
    theme_color: "#050706",
    icons: [
      {
        src: "/brand/sach-sports-crown-logo.png",
        type: "image/png",
        sizes: "any",
        purpose: "any",
      },
    ],
  };
}
