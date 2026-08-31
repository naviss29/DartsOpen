import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DartsOpen — Gestion de tournois de fléchettes",
    short_name: "DartsOpen",
    description: "Plateforme SaaS de gestion de tournois de fléchettes, un produit BApps Studio.",
    start_url: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#078099",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/brand/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
