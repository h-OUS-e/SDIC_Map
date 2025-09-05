import type { NextConfig } from "next";

const repo = "SDIC_Map";                          // <-- your repo name
const isProd = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  output: "export",                                // static export for GH Pages
  reactStrictMode: true,
  basePath: isProd ? `/${repo}` : "",              // prefix routes under /SDIC_Map in prod
  assetPrefix: isProd ? `/${repo}/` : "",          // load _next assets from /SDIC_Map/_next
  images: { unoptimized: true },                   // GH Pages can't run the image optimizer
  // Optional but helpful for static hosting deep links:
  // trailingSlash: true,
};

export default nextConfig;