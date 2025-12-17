import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  // Path aliases for cleaner imports
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  // Drop console logs and debugger in production
  esbuild: {
    drop: ['console', 'debugger'],
  },

  // Build optimizations
  build: {
    // Output directory
    outDir: 'dist',

    // Generate sourcemaps for production debugging
    sourcemap: false,

    // Minification - using esbuild (faster and better supported in Vite)
    minify: 'esbuild',

    // Code splitting configuration
    rollupOptions: {
      output: {
        // Manual chunks for better caching
        manualChunks: {
          // React core
          'react-vendor': ['react', 'react-dom'],

          // State management
          'state': ['zustand', 'immer'],

          // Utilities
          'utils': [
            './src/utils/formatters',
            './src/utils/performance',
          ],

          // Core logic
          'core': [
            './src/core/types',
            './src/core/intervals',
            './src/core/metrics',
            './src/core/ranking',
          ],

          // Data layer
          'data': [
            './src/data/binanceRest',
            './src/data/binanceWs',
            './src/data/clientProvider',
            './src/data/candleCache',
          ],

          // Engine
          'engine': ['./src/engine/ClientEngine'],

          // Chart components (largest component)
          'charts': [
            './src/components/charts/TimeSeriesCandleChart',
          ],
        },

        // Asset file naming
        assetFileNames: (assetInfo) => {
          if (/\.(png|jpe?g|svg|gif|tiff|bmp|ico)$/i.test(assetInfo.name ?? '')) {
            return `assets/images/[name]-[hash][extname]`;
          }

          if (/\.(woff2?|eot|ttf|otf)$/i.test(assetInfo.name ?? '')) {
            return `assets/fonts/[name]-[hash][extname]`;
          }

          return `assets/[name]-[hash][extname]`;
        },

        // Chunk file naming
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js',
      },
    },

    // Chunk size warnings
    chunkSizeWarningLimit: 1000, // 1MB

    // Asset inline threshold (smaller assets inlined as base64)
    assetsInlineLimit: 4096, // 4KB
  },

  // Server configuration
  server: {
    port: 5173,
    strictPort: true,
    host: true,
    open: true, // Auto-open browser
    proxy: {
      '/fapi': {
        target: 'https://fapi.binance.com',
        changeOrigin: true,
        secure: false,
      },
    },
  },

  // Preview server configuration
  preview: {
    port: 4173,
    strictPort: true,
    host: true,
    open: true,
  },

  // Dependency optimization
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'zustand',
    ],
  },

  // Base URL (for deployment to subdirectories)
  base: '/',
})
