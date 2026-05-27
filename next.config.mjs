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
  serverExternalPackages: ['@ericblade/quagga2', 'sharp', 'ndarray-pixels'],
};

export default nextConfig;
