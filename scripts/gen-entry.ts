import fg from 'fast-glob';
import { writeFile } from 'node:fs/promises';

const files = await fg('src/**/*.ts');

const content = files
  .map(f => f.replace(/^src\//, '').replace(/\.ts$/, ''))
  .map(f => `export * from './${f}';`)
  .join('\n');

await writeFile('src/index.ts', content);