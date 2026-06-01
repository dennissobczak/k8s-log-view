import type { NextConfig } from "next";
import { execSync } from "node:child_process";

// Resolve the build version once, at build time. Prefer CI-provided values
// (e.g. set during the container build) and fall back to local git.
function git(command: string, fallback: string): string {
  try {
    return execSync(command).toString().trim();
  } catch {
    return fallback;
  }
}

const branch =
  process.env.GIT_BRANCH ?? git("git rev-parse --abbrev-ref HEAD", "unknown");
const commit =
  process.env.GIT_COMMIT ?? git("git rev-parse --short HEAD", "unknown");

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_GIT_BRANCH: branch,
    NEXT_PUBLIC_GIT_COMMIT: commit,
  },
};

export default nextConfig;
