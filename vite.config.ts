import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig({
  // Relative paths so GitHub project Pages (/repo-name/) and custom domains both work.
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react-dom') || id.includes('/react/')) return 'react';
            if (id.includes('pinyin-pro')) return 'pinyin';
            if (id.includes('lucide-react')) return 'icons';
            return;
          }
          // Large lesson corpus — own chunk so main app JS stays leaner / cacheable
          if (id.includes('/src/data/curriculum')) return 'curriculum';
        },
      },
    },
  },
});
