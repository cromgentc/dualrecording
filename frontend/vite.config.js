import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const backendTarget = 'http://127.0.0.1:5000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // During dev, Vite proxies API and recording requests to the Node backend.
    proxy: {
      '/api': backendTarget,
      '/recordings': backendTarget,
      '/health': backendTarget,
    },
  },
})
