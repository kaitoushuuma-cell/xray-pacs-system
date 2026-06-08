import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173
  },
  cacheDir: '/root/xray-pacs-system/frontend/.vite-cache'
})
