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
    },
  },
})
