import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  assetPrefix: 'https://<Account-name>/<Repository-name>',
  output: "export",
  reactStrictMode: true,
};

export default nextConfig;
