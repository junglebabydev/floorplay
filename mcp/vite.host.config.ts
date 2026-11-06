import { defineConfig } from 'vite'
import { resolve } from 'node:path'
export default defineConfig({ root: resolve(import.meta.dirname, 'test-host'), publicDir: false, server: { port: 5180 }, build: { outDir: resolve(import.meta.dirname, '../dist-mcp/test-host'), emptyOutDir: true } })
