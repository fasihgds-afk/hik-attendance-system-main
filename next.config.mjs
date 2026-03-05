import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Fix: Use project root so Next.js doesn't infer from parent lockfile
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
