import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base relativa: o mesmo build funciona em https://usuario.github.io/repositorio/,
// em um domínio próprio ou aberto por qualquer servidor estático local.
export default defineConfig({
  base: "./",
  plugins: [react()],
  // 127.0.0.1 em vez de "localhost": evita a resolução para IPv6 (::1) em algumas máquinas
  server: { host: "127.0.0.1", port: 5173 },
  preview: { host: "127.0.0.1", port: 4173 },
  build: { target: "es2020", chunkSizeWarningLimit: 900 },
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
} as any);
