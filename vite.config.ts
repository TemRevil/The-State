import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Served at the custom domain root (the-state.temrevil.com) — no base path.
  base: '/',
  build: {
    outDir: 'dist',
  }
})