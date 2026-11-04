import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@rgs-ledger/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
      '@rgs-ledger/payment-core': path.resolve(__dirname, '../../packages/payment-core/src/index.ts')
    }
  },
  server: {
    port: 5174,
    host: true
  }
});
