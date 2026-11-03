import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Während der Entwicklung leitet Vite /sync und /api an den lokalen Server weiter
// (npm run server in einem zweiten Terminal).
const proxy = {
  '/sync': { target: 'ws://127.0.0.1:4300', ws: true },
  '/api': 'http://127.0.0.1:4300',
};

// Relative Pfade, damit der Build auch aus einem Unterordner geöffnet werden kann.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5173, proxy },
  preview: { proxy },
  build: {
    // Die lokal eingebundene Weltkarte macht das Bundle bewusst etwas größer.
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: { main: 'index.html', ausgabe: 'ausgabe.html' },
    },
  },
});
