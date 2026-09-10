import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Planning Vauchel",
    short_name: "Vauchel",
    description: "Mon planning — Ferronnerie Vauchel",
    start_url: "/moi",
    display: "standalone",
    background_color: "#1c1917",
    theme_color: "#b45309",
    lang: "fr",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon.svg",
        sizes: "192x192",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
