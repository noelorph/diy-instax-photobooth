import type { NextConfig } from 'next';
import { networkInterfaces } from 'node:os';

const wifiIPv4 = networkInterfaces().en0?.find(
  (entry) => entry.family === 'IPv4' && !entry.internal
)?.address;

const nextConfig: NextConfig = {
  /* config options here */
  allowedDevOrigins: wifiIPv4 ? [wifiIPv4] : [],
  experimental: {
    agentFeedback: true,
    agentUpgrade: 'security',
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      // Only the Tailwind entry needs this loader; remapping module files to
      // plain CSS drops their scoped class exports.
      'globals.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default nextConfig;
