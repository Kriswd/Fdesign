import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, '/');

          if (!normalizedId.includes('/node_modules/')) {
            return undefined;
          }

          if (
            normalizedId.includes('/react/') ||
            normalizedId.includes('/react-dom/') ||
            normalizedId.includes('/react-router-dom/') ||
            normalizedId.includes('/scheduler/')
          ) {
            return 'react-vendor';
          }

          if (normalizedId.includes('/ag-psd/')) {
            return 'psd-vendor';
          }

          if (normalizedId.includes('/xlsx/')) {
            return 'spreadsheet-vendor';
          }

          if (
            normalizedId.includes('/react-moveable/') ||
            normalizedId.includes('/react-selecto/') ||
            normalizedId.includes('/react-xarrows/') ||
            normalizedId.includes('/react-zoom-pan-pinch/') ||
            normalizedId.includes('/moveable/') ||
            normalizedId.includes('/selecto/')
          ) {
            return 'canvas-vendor';
          }

          if (normalizedId.includes('/lucide-react/') || normalizedId.includes('/framer-motion/')) {
            return 'ui-vendor';
          }

          if (
            normalizedId.includes('/html-to-image/') ||
            normalizedId.includes('/jszip/') ||
            normalizedId.includes('/buffer/') ||
            normalizedId.includes('/process/')
          ) {
            return 'export-vendor';
          }

          return 'vendor';
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3020,
    watch: {
      ignored: ['**/logs/**', '**/output/**'],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/templates': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/3-字体': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/3-%E5%AD%97%E4%BD%93': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
