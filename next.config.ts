import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pins the workspace root explicitly. Without this, Next/Turbopack infers
  // the root by walking up for the nearest lockfile and found an unrelated,
  // orphaned package-lock.json in the parent user directory (no matching
  // package.json there - not part of this project), logging "Next.js
  // inferred your workspace root, but it may not be correct" on every dev/
  // build run. Harmless for `next build` (it still built from the invoked
  // directory), but this ambiguity is exactly the kind of thing that can
  // make `next dev` resolve the app directory inconsistently between runs -
  // fixed per Next's own suggested remedy in that warning.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
