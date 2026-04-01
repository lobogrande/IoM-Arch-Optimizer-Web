import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
build: {
    chunkSizeWarningLimit: 2000, // Raises the warning threshold to 2MB
    rollupOptions: {
      output: {
        // Rolldown strictly requires a function to parse chunk assignments
        manualChunks(id) {
          if (id.includes('plotly.js') || id.includes('react-plotly')) {
            return 'plotly';
          }
          if (id.includes('ag-grid')) {
            return 'aggrid';
          }
        }
      }
    }
  }
})
