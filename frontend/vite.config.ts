import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const e2eAuth0Stub = decodeURIComponent(
  new URL('./e2e/auth0-stub.ts', import.meta.url).pathname,
)

export default defineConfig(({ mode }) => ({
  envDir: '..',
  plugins: [react()],
  ...(mode === 'e2e'
    ? {
        resolve: {
          alias: {
            '@auth0/auth0-spa-js': e2eAuth0Stub,
          },
        },
      }
    : {}),
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          charts: ['recharts'],
        },
      },
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:9000',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:9000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://backend:9000',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://backend:9000',
        changeOrigin: true,
      },
    },
  },
}))
