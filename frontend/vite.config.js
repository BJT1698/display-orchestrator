import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true
      },
      '/media': {
        target: 'http://localhost:8080',
        changeOrigin: true
      },
      '/ws': {
        target: 'ws://localhost:8080',
        ws: true
      }
    }
  },
  build: {
    outDir: '../server/public',
    emptyOutDir: true,
    rollupOptions: {
      // The dashboard, and the public page guests use to ask to share their screen
      input: { main: 'index.html', cast: 'cast.html' }
    }
  }
});
