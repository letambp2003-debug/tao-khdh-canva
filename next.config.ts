import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // output: 'standalone', // Bỏ comment khi build production
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  serverExternalPackages: ['docx', 'katex'],
};

export default nextConfig;
