import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Splitmate: Workout Planner & Tracker",
    short_name: "Splitmate",
    description: "Plan training splits and log workouts with your previous sets in view.",
    start_url: "/train",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0f1011",
    theme_color: "#0f1011",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
