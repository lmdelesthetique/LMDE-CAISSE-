/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
  async redirects() {
    return [{ source: '/', destination: '/dashboard', permanent: false }];
  },
  async headers() {
    return [
      {
        // Never cache HTML pages — always serve fresh so new JS chunks are loaded
        source: '/((?!_next/static|_next/image|favicon.ico|icons|assets).*)',
        headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
      },
    ];
  },
  serverExternalPackages: ['@ericblade/quagga2', 'sharp', 'ndarray-pixels'],
};

export default nextConfig;
