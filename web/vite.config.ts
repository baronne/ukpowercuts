import { defineConfig } from 'vite';

// In dev, forward API calls to `wrangler dev` (npm run dev:worker).
export default defineConfig({
  server: { proxy: { '/api': 'http://localhost:8787', '/exports': 'http://localhost:8787' } },
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
});
