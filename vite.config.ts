import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');

  // VITE_DEMO_MODE=true => sustituye Firebase por mocks en memoria.
  // Útil para publicar la app en GitHub Pages sin backend real.
  const isDemo =
    process.env.VITE_DEMO_MODE === 'true' || env.VITE_DEMO_MODE === 'true';

  // BASE_URL controla el subdirectorio donde se sirve el bundle
  // (en GitHub Pages suele ser /<repo>/). Default: '/'.
  const base = process.env.BASE_URL || env.BASE_URL || '/';

  const demoAliases = isDemo
    ? {
        'firebase/app':       path.resolve(__dirname, 'src/demo/app-mock.ts'),
        'firebase/auth':      path.resolve(__dirname, 'src/demo/auth-mock.ts'),
        'firebase/firestore': path.resolve(__dirname, 'src/demo/firestore-mock.ts'),
        'firebase/analytics': path.resolve(__dirname, 'src/demo/analytics-mock.ts'),
      }
    : {};

  return {
    base,
    define: {
      'import.meta.env.VITE_DEMO_MODE': JSON.stringify(isDemo ? 'true' : 'false'),
    },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        ...demoAliases,
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
