import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, '.', '');
  const isProd = mode === 'production';

  return {
    plugins: [react()],
    // Se estivermos rodando localmente (serve), usamos a raiz '/'.
    // Se estivermos gerando a build para o GitHub (build), usamos a subpasta.
    base: command === 'serve' ? '/' : '/MasterBuyer-2026/',

    // Aqui criamos a "ponte" para o seu código atual
    define: {
      'process.env.API_KEY': JSON.stringify(env.API_KEY || process.env.API_KEY)
    },

    build: {
      outDir: 'dist',
    }
  };
});
