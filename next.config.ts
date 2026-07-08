import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ffmpeg-static ships a binary and derives its path from its own file location. Bundling it
  // rewrites that path to a non-existent location, so keep it external and let Node resolve it
  // from node_modules at runtime (otherwise spawn fails and every screenshot comes back null).
  serverExternalPackages: ["ffmpeg-static"],
};

export default nextConfig;
