import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

process.env.VITE_BUILD_TIME ??= new Date().toISOString()

function buildVersionAsset(): Plugin {
  return {
    name: 'build-version-asset',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'build-version.json',
        source: JSON.stringify({
          buildNumber: process.env.VITE_BUILD_NUMBER ?? 'dev',
          buildTime: process.env.VITE_BUILD_TIME ?? '',
        }),
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), buildVersionAsset()],
  base: '/market-dashboard/',
  build: {
    sourcemap: false,
  },
})
