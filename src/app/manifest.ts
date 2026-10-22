import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Misal Hub OS",
    short_name: "Misal Hub",
    description: "POS, kitchen, inventory and franchise management",
    start_url: "/",
    display: "standalone",
    background_color: "#faf7f4",
    theme_color: "#f45d0a",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
