import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules", ".next"],
    // @naviss29/design-system@0.4.0 émet des imports relatifs sans extension .js dans son
    // ESM compilé (dist/index.js: `from "./tokens/colors"`) — invalide au sens strict de la
    // résolution Node native, mais tolérée par les bundlers (Next.js, Vite). Sans ce flag,
    // Vitest délègue par défaut la résolution des dépendances de node_modules à Node plutôt
    // qu'à Vite, ce qui fait échouer ces imports. Bug du paquet amont (bapps-shared, autre
    // dépôt), contourné ici côté outillage de test uniquement.
    server: {
      deps: {
        inline: ["@naviss29/design-system"],
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
