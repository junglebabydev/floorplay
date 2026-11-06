// Builds the in-chat view as one self-contained HTML file (MCP Apps load it as a ui:// resource).
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { resolve } from 'node:path'

export default defineConfig({
  root: resolve(import.meta.dirname, '..'),
  publicDir: false,
  plugins: [react(), tailwindcss(), viteSingleFile()],
  build: {
    outDir: 'dist-mcp',
    emptyOutDir: true,
    chunkSizeWarningLimit: 4000,
    rollupOptions: { input: resolve(import.meta.dirname, 'widget.html') },
  },
})
