import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Vite 8.3 decides which worker assets to emit from the UI module graph.
// Keep both nested dispatchers in that graph when their callers only run in a worker.
export const spatialWorkerEntries: Plugin = {
  name: 'retain-spatial-worker-entries',
  apply: 'build',
  transform: {
    filter: { id: /[/\\]src[/\\]app[/\\]diagramSpatial(?:LayerSolver|RegionDepth)\.ts$/ },
    handler() { return { moduleSideEffects: 'no-treeshake' }; },
  },
};

export default defineConfig(({mode})=>({
  base:mode==='web'?'/origami-workbench/':'/',
  define:{'import.meta.env.VITE_WEB_APP':JSON.stringify(mode==='web'?'true':'false')},
  plugins: [react(), spatialWorkerEntries],
  server: { host: '127.0.0.1', port: 5173, strictPort: true, watch:{ignored:['**/.toolchain/**','**/.runtime/**','**/output/**','**/build/**','**/release/**','**/src-tauri/target/**']}, proxy: { '/api': 'http://127.0.0.1:8787' } },
  build: { outDir:mode==='web'?'build/web':'dist',target: 'es2022', sourcemap:mode!=='web', rolldownOptions: { input: { main: resolve('index.html'), simulator: resolve('simulator/index.html') } } },
}));
