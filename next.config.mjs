import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Fix: Use project root so Next.js doesn't infer from parent lockfile
  turbopack: {
    root: __dirname,
  },
  // Prevent 304/caching on auth routes - fixes auto-logout on Vercel
  async headers() {
    const noStoreApi = [
      { key: 'Cache-Control', value: 'private, no-store, no-cache, must-revalidate' },
      { key: 'Pragma', value: 'no-cache' },
      { key: 'Expires', value: '0' },
    ];
    return [
      {
        source: '/api/auth/:path*',
        headers: [
          ...noStoreApi,
          { key: 'Surrogate-Control', value: 'no-store' },
        ],
      },
      {
        source: '/api/hr/:path*',
        headers: [
          ...noStoreApi,
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
      {
        source: '/api/employee/:path*',
        headers: [
          ...noStoreApi,
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
      {
        source: '/:path*',
        headers: [{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }],
      },
    ];
  },
};

export default nextConfig;
