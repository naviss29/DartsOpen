import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',

  // Turbopack est le bundler par défaut en Next.js 16 — on déclare la config vide
  // pour signaler que c'est intentionnel (évite l'erreur de build).
  turbopack: {},

  webpack: (config, { dev }) => {
    // cheap-module-source-map n'utilise pas eval() — compatible avec les CSP
    // qui bloquent eval (extensions navigateur, proxy d'entreprise, etc.)
    // Ce bloc ne s'applique qu'aux builds webpack explicites (--webpack).
    if (dev) config.devtool = 'cheap-module-source-map';
    return config;
  },
};

export default nextConfig;
