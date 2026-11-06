import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // En desarrollo la API se sirve por el mismo origen (sin CORS)
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
