import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // During dev, Vite proxies API and recording requests to the Node backend.
    proxy: {
      '/api': 'http://localhost:5000',
      '/recordings': 'http://localhost:5000',
      '/health': 'http://localhost:5000',
    },
  },
})
