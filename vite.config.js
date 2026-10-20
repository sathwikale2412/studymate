import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Local dev talks to the Flask module on port 5001:
//   cd api && flask --app index run --port 5001
// so the browser can keep using the same /api/* paths it uses in production.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  }
});
