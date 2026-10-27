import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    cli: 'src/cli.ts',
  },
  format: ['cjs'],
  dts: true,
  clean: true,
  target: 'node18',
  sourcemap: true,
  publicDir: false,
});
