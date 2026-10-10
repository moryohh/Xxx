import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The root index is also published directly by Pages. Build from React source.
export default defineConfig({
  plugins: [{ name: 'react-source-entry', transformIndexHtml: { order: 'pre', handler(html) {
    return html.replace(/<script[^>]*src=["']\.\/assets\/[^"']+["'][^>]*><\/script>/g, '<script type="module" src="/src/main.jsx"></script>').replace(/<link[^>]*href=["']\.\/assets\/[^"']+["'][^>]*>/g, '')
  } } }, react()],
  base: './',
  build: { outDir: 'dist', assetsDir: 'assets' }
})
