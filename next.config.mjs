import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Lets a phone open the development copy through a tunnel. Next refuses its development
  // scripts to other hosts unless they are named here, and the page then loads but does
  // nothing. The built copy (npm run build, npm run start) does not need this.
  allowedDevOrigins: ['*.trycloudflare.com', ...(process.env.DHOOP_DEV_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)],
  images: {
    unoptimized: true,
  },
  turbopack: {
    root: rootDir,
  },
  experimental: {
    webpackBuildWorker: true,
    parallelServerBuildTraces: true,
    parallelServerCompiles: true,
  },
};

export default nextConfig;
