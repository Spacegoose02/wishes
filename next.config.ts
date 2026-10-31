import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["qrcode"],
  images: { unoptimized: true },
  // Photos are shrunk in the browser first; the extra room means an unshrunk photo gets a
  // friendly "too big" message from the app instead of a crash page.
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
};

export default nextConfig;
