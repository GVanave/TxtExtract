import type { MetadataRoute } from "next";

/** Lets phones install the app on the home screen ("Add to Home Screen"). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kassenbon – receipt tracker",
    short_name: "Kassenbon",
    description: "Scan supermarket receipts and track your spending.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f7f5",
    theme_color: "#0f766e",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
