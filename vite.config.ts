import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

process.env.VITE_BUILD_TIME ??= new Date().toISOString()

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/market-dashboard/',
})
