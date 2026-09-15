import type { NextConfig } from 'next';
import path from 'path';

// Security headers applied to all routes.
// These are server-side HTTP response headers — they cannot be spoofed by clients.
const SECURITY_HEADERS = [
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'X-XSS-Protection',
    value: '1; mode=block',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    // Allow camera/microphone only on the dashboard (for future media capture features).
    // Deny geolocation and other powerful features entirely.
    value: 'camera=(), microphone=(), geolocation=()',
  },
  {
    key: 'Strict-Transport-Security',
    // max-age=2 years; only effective over HTTPS (TLS terminator must pass it through)
    value: 'max-age=63072000; includeSubDomains; preload',
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: false,  // Changed to false — fail the build on lint errors in production
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  // Security headers for all routes
  async headers() {
    return [
      {
        // Apply to every route
        source: '/(.*)',
        headers: SECURITY_HEADERS,
      },
    ];
  },
  // Remote image domains — restrict to only what is actually needed.
  // Remove picsum.photos before shipping to production (it is a placeholder domain).
  images: {
    remotePatterns: [
      {
        // Cloudinary CDN — used for uploaded media previews
        protocol: 'https',
        hostname: 'res.cloudinary.com',
        port: '',
        pathname: '/**',
      },
      // TODO: Remove the picsum.photos entry below before deploying to production.
      // It is only used for placeholder/mock images during development.
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
  },
  // Generate a standalone output for Docker deployment
  output: 'standalone',
  // Explicitly set the workspace root to THIS folder so Next.js doesn't
  // get confused by other lockfiles in parent directories.
  outputFileTracingRoot: path.join(__dirname),
  outputFileTracingExcludes: {
    '*': ['./node_modules/**/*'],
  },
  transpilePackages: ['motion'],
  webpack: (config, { dev }) => {
    // HMR is disabled in certain CI environments via DISABLE_HMR env var.
    if (dev && process.env.DISABLE_HMR === 'true') {
      config.watchOptions = {
        ignored: /.*/,
      };
    }
    return config;
  },
};

export default nextConfig;
