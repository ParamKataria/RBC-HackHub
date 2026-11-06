import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Keep Turbopack rooted in this repo so it ignores ~/package-lock.json.
  turbopack: {
    root: path.join(process.cwd()),
  },
};

export default nextConfig;
