import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',

  webpack: (config, { dev }) => {
    // cheap-module-source-map n'utilise pas eval() — compatible avec les CSP
    // qui bloquent eval (extensions navigateur, proxy d'entreprise, etc.)
    if (dev) config.devtool = 'cheap-module-source-map';
    return config;
  },
};

export default nextConfig;
