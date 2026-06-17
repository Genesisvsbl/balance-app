import type { NextConfig } from "next";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  output: "export",
  ...(basePath
    ? {
        basePath,
        assetPrefix: basePath,
      }
    : {}),
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
