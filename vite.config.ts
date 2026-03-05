import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  build: {
    minify: 'esbuild',
    sourcemap: true,
    lib: {
      entry: './src/index.ts',
      name: 'proto',
      formats: ['es'],
      fileName: 'index',
    },
    rollupOptions: {
      external: ['@bufbuild/protobuf'],
    },
  },
  esbuild: {
    target: 'es2022',
    keepNames: true,
  },
  plugins: [dts({ entryRoot: 'src', rollupTypes: true })],
});
