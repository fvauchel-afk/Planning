import type { MetadataRoute } from "next";
import { APP_DESCRIPTION, APP_NAME, BRAND_BLUE } from "@/lib/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: "Planning",
    description: APP_DESCRIPTION,
    start_url: "/connexion",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#1c1917",
    theme_color: BRAND_BLUE,
    lang: "fr",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
