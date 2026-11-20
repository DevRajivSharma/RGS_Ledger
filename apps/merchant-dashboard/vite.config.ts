import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiUrl = env.VITE_API_URL || env.API_BASE_URL || 'http://localhost:4000';

  return {
    plugins: [react()],
    server: {
      port: 3001,
      proxy: {
        '/api': {
          target: apiUrl,
          changeOrigin: true,
          secure: false
        },
        '/v1': {
          target: apiUrl,
          changeOrigin: true,
          secure: false
        }
      }
    }
  };
});
