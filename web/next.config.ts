import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite (local development and tests only) ships WebAssembly and data files that must not be bundled.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
