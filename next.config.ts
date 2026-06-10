import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained build (.next/standalone) so the Docker image can run
  // without installing node_modules. See node_modules/next/dist/docs/.../output.md
  output: "standalone",
};

export default nextConfig;
