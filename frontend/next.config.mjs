/** @type {import('next').NextConfig} */
const backendUrl =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.BACKEND_INTERNAL_URL ||
  'http://127.0.0.1:4000';

const nextConfig = {
  reactStrictMode: false,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;

