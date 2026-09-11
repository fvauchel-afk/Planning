import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ferronnerie Vauchel - Planning",
    short_name: "Planning",
    description: "Planning d'équipe — Ferronnerie Vauchel",
    start_url: "/connexion",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#1c1917",
    theme_color: "#b45309",
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
