import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        credentials: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split large, rarely-changing vendor deps into their own chunks so they
        // download in parallel and stay cached across app-code deploys. Function form
        // so React lands in its own chunk rather than being pulled into fullcalendar's.
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('@fullcalendar')) return 'fullcalendar'
            if (id.includes('/react') || id.includes('/react-dom') || id.includes('/scheduler')) return 'react'
          }
        },
      },
    },
  },
})
