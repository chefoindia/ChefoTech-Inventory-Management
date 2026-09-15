import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@pharmaos/shared'],
  reactStrictMode: true,
  poweredByHeader: false,
  images: { remotePatterns: [{ protocol: 'https', hostname: 'res.cloudinary.com' }] },
};

export default nextConfig;
