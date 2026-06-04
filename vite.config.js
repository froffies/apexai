import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  logLevel: 'error',
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.split(path.sep).join("/")
          if (normalizedId.includes("/node_modules/react/") || normalizedId.includes("/node_modules/react-dom/") || normalizedId.includes("/node_modules/react-router-dom/")) {
            return "vendor-react"
          }
          if (normalizedId.includes("/node_modules/@supabase/supabase-js/") || normalizedId.includes("/node_modules/@tanstack/react-query/")) {
            return "vendor-data"
          }
          if (normalizedId.includes("/node_modules/lucide-react/")) {
            return "vendor-ui"
          }
          if (normalizedId.includes("/node_modules/recharts/")) {
            return "vendor-charts"
          }
          if (
            normalizedId.includes("/node_modules/@capacitor/core/")
            || normalizedId.includes("/node_modules/@capacitor/app/")
            || normalizedId.includes("/node_modules/@capacitor/haptics/")
            || normalizedId.includes("/node_modules/@capacitor/local-notifications/")
            || normalizedId.includes("/node_modules/@capacitor/share/")
          ) {
            return "vendor-native"
          }
          if (
            normalizedId.includes("/src/lib/AuthContext.jsx")
            || normalizedId.includes("/src/lib/cloudSync.js")
            || normalizedId.includes("/src/lib/supabaseClient.js")
            || normalizedId.includes("/src/lib/accountApiClient.js")
            || normalizedId.includes("/src/lib/telemetry.js")
            || normalizedId.includes("/src/lib/query-client.js")
            || normalizedId.includes("/src/components/AuthScreen.jsx")
          ) {
            return "app-auth"
          }
          if (
            normalizedId.includes("/src/lib/appStorage.js")
            || normalizedId.includes("/src/lib/useLocalStorage.js")
            || normalizedId.includes("/src/lib/fitnessDefaults.js")
            || normalizedId.includes("/src/lib/tabStack.js")
          ) {
            return "app-state"
          }
        },
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  plugins: [react()]
});
