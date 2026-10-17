import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["qrcode"],
  images: { unoptimized: true },
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
};

export default nextConfig;
