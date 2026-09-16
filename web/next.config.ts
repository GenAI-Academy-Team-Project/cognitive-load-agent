import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  allowedDevOrigins: ['carestead.com'],
  // Vinext classifies multipart POSTs as progressive server actions before
  // route matching. Leave enough headroom for Carestead's validated 5 MB
  // document limit plus multipart boundaries and metadata.
  experimental: {
    serverActions: {
      bodySizeLimit: '6mb',
    },
  },
};

export default nextConfig;
