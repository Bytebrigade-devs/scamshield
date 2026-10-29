import type { NextConfig } from "next";
const config: NextConfig = {
  output: "export",
  trailingSlash: true,
  poweredByHeader: false,
  outputFileTracingRoot: process.cwd(),
  images: { unoptimized: true },
  experimental: { cpus: 1, workerThreads: true, webpackBuildWorker: false },
};
export default config;
