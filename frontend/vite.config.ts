import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/webhooks': 'http://localhost:3000',
    },
  },
  build: {
    outDir: '../backend/public',
    emptyOutDir: true,
    sourcemap: false,
    minify: mode === 'production' ? 'terser' : 'esbuild',
    terserOptions:
      mode === 'production'
        ? { compress: { drop_console: true, drop_debugger: true } }
        : undefined,
  },
}))
