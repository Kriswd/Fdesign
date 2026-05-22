import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
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
