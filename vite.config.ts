import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `vite build` → dist/ (eigener Server)
// `vite build --mode artifact` → dist-artifact/ (eine Datei für die Veröffentlichung auf claude.ai)
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3001' },
  },
  build:
    mode === 'artifact'
      ? {
          outDir: 'dist-artifact',
          assetsInlineLimit: 100_000_000,
          cssCodeSplit: false,
          sourcemap: false,
          chunkSizeWarningLimit: 4000,
          rollupOptions: { output: { inlineDynamicImports: true } },
        }
      : { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 900 },
}));
