import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
export default defineConfig(({mode})=>({
  base:mode==='web'?'/origami-workbench/':'/',
  define:{'import.meta.env.VITE_WEB_APP':JSON.stringify(mode==='web'?'true':'false')},
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true, watch:{ignored:['**/.toolchain/**','**/.runtime/**','**/output/**','**/build/**','**/release/**','**/src-tauri/target/**']}, proxy: { '/api': 'http://127.0.0.1:8787' } },
  build: { outDir:mode==='web'?'build/web':'dist',target: 'es2022', sourcemap:mode!=='web', rolldownOptions: { input: { main: resolve('index.html'), simulator: resolve('simulator/index.html') } } },
}));
