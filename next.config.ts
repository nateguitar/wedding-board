import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // This project lives in a subfolder alongside other lockfiles; pin the tracing
  // root so Next doesn't infer the parent directory.
  outputFileTracingRoot: path.resolve(__dirname),
};

export default nextConfig;
