import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, '.', '');
  const isProd = mode === 'production';

  return {
    plugins: [react()],
    base: process.env.DEPLOY_TARGET === 'github' ? '/MasterBuyer-2026/' : '/',

    // Aqui criamos a "ponte" para o seu código atual
    define: {
      'process.env.API_KEY': JSON.stringify(env.API_KEY || process.env.API_KEY)
    },

    optimizeDeps: {
      exclude: ['pdfjs-dist'],
    },

    build: {
      outDir: 'dist',
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/'))
              return 'vendor-react';
            if (id.includes('node_modules/firebase/') || id.includes('node_modules/@firebase/'))
              return 'vendor-firebase';
            if (id.includes('node_modules/@google/genai'))
              return 'vendor-genai';
            if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-'))
              return 'vendor-charts';
            if (id.includes('node_modules/lucide-react'))
              return 'vendor-lucide';
            if (id.includes('node_modules/pdfjs-dist'))
              return 'vendor-pdfjs';
          }
        }
      }
    }
  };
});
