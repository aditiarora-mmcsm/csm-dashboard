/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow the large dashboard HTML to be read at request time
  experimental: {
    serverComponentsExternalPackages: [],
  },
  // Increase the body size limit for CSV uploads via API routes
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export default nextConfig;
