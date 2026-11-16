import fs from 'node:fs'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { parse } from 'yaml'

const CONTENT_DIR = path.resolve(__dirname, 'content')
const VIRTUAL_ID = 'virtual:content'
const RESOLVED_ID = '\0' + VIRTUAL_ID

/**
 * Reads every content/*.yaml file at build time and exposes them as `virtual:content`:
 *   data: { profile: {...}, publications: [...], ... }   (parsed)
 *   raw:  { 'profile.yaml': '...' }                       (original text, used by the Terminal/Finder apps)
 * No YAML parser ships to the browser, and editing a file hot-reloads the page in dev.
 */
function portfolioContent(): Plugin {
  return {
    name: 'portfolio-content',
    resolveId: (id) => (id === VIRTUAL_ID ? RESOLVED_ID : undefined),
    load(id) {
      if (id !== RESOLVED_ID) return
      const data: Record<string, unknown> = {}
      const raw: Record<string, string> = {}
      for (const file of fs.readdirSync(CONTENT_DIR).sort()) {
        if (!/\.ya?ml$/.test(file)) continue
        const full = path.join(CONTENT_DIR, file)
        this.addWatchFile(full)
        const text = fs.readFileSync(full, 'utf8')
        raw[file] = text
        try {
          // 'core' schema keeps dates such as 2026-05-01 as plain strings
          data[file.replace(/\.ya?ml$/, '')] = parse(text, { schema: 'core' })
        } catch (err) {
          this.error(`content/${file}: ${(err as Error).message}`)
        }
      }
      return `export const data = ${JSON.stringify(data)};\nexport const raw = ${JSON.stringify(raw)};`
    },
    handleHotUpdate({ file, server }) {
      if (!file.startsWith(CONTENT_DIR)) return
      const mod = server.moduleGraph.getModuleById(RESOLVED_ID)
      if (mod) server.moduleGraph.invalidateModule(mod)
      server.ws.send({ type: 'full-reload' })
      return []
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), portfolioContent()],
  // relative base so the build also works on GitHub Pages project sites
  base: './',
  build: { chunkSizeWarningLimit: 1500 },
})
