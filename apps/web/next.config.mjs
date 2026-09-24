/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@peladafc/ui', '@peladafc/domain', '@peladafc/contracts'],
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
