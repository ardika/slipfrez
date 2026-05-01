import type { NextConfig } from "next";

const isGhPages = process.env.GITHUB_PAGES === "true";

const nextConfig: NextConfig = {
  output: "export",
  basePath: isGhPages ? "/slipfrez" : "",
  assetPrefix: isGhPages ? "/slipfrez/" : "",
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
