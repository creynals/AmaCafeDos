import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 8080,
    // C89: wildcard tunnel hosts (cloudflared + ngrok). Leading dot = any subdomain.
    allowedHosts: ['.trycloudflare.com', '.ngrok-free.dev', '.ngrok.io', 'localhost'],
    // C96: un solo túnel público apunta a Vite (8080) y Vite proxea al backend.
    // /webhook/sumup necesita raw body — http-proxy lo reenvía sin parsear porque
    // Vite no consume el body en rutas no-HMR. Esto unifica buildReturnUrls():
    //   <tunnel>/webhook/sumup     → backend:7001
    //   <tunnel>/checkout/success  → SPA Vite (React Router)
    //   <tunnel>/checkout/failure  → SPA Vite (cuando exista la ruta)
    proxy: {
      '/api': 'http://localhost:7001',
      '/webhook': 'http://localhost:7001',
      // C18: imágenes subidas por admin se sirven desde backend en /static.
      // Sin este proxy vite devolvía la SPA index.html (HTTP 200 + text/html)
      // y los <img> aparecían rotos sin error claro en la consola.
      '/static': 'http://localhost:7001',
    },
  },
  // C129: `vite preview` (used by Railway) defaults to port 4173 + localhost
  // and rejects unknown Host headers since Vite 4.3. Without this block the
  // healthcheck on / hits port 8080 (server.port) instead of $PORT and times
  // out. Reading process.env.PORT lets Railway inject the bound port; the CLI
  // flags in frontend/railway.toml are kept as a redundant safety net.
  preview: {
    port: Number(process.env.PORT) || 4173,
    host: '0.0.0.0',
    allowedHosts: ['.up.railway.app', '.railway.app'],
  },
})
