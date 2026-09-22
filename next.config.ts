import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "playwright", "playwright-core"],
  // Allow coworkers / other hosts hitting this VPS in `next dev`
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
    "62.169.22.108",
    "0.0.0.0",
  ],
};

export default nextConfig;
